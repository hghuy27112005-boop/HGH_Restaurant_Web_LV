import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatbotAPI } from '@/services/chatbotApi';
import { useAuthContext } from '@/context/AuthContext';
import chatbotScripts from '@/data/chatbot_customer_scripts';

const ChatbotWidget = () => {
    const navigate = useNavigate();
    const { logout, isAuthenticated } = useAuthContext();

    const [isOpen, setIsOpen] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [currentNodeId, setCurrentNodeId] = useState('root');
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [suppressOptions, setSuppressOptions] = useState(false);
    const [suggestedNav, setSuggestedNav] = useState(null); // { route, label } | null
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Xem lại đoạn chat cũ theo ngày (chỉ xem, không nhắn được)
    const [historyDate, setHistoryDate] = useState(null); // null = đang ở đoạn chat live hôm nay
    const [historyMessages, setHistoryMessages] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [chatDays, setChatDays] = useState([]);
    const [showDaysMenu, setShowDaysMenu] = useState(false);

    const currentNode = chatbotScripts[currentNodeId];

    useEffect(() => {
        if (isOpen && !loaded && isAuthenticated) {
            chatbotAPI.getSession().then((res) => {
                const data = res.data;
                const nodeId = data.current_node_id || 'root';
                setCurrentNodeId(nodeId);
                setMessages(data.messages || []);
                setLoaded(true);

                // Hôm nay chưa có tin nhắn nào -> để bot chủ động chào trước
                if (!data.messages || data.messages.length === 0) {
                    handleAutoNext(nodeId);
                }
            });
        }
    }, [isOpen, loaded, isAuthenticated]);

    useEffect(() => {
        if (!loaded) return;
        const node = chatbotScripts[currentNodeId];
        if (node?.autoNext) {
            handleAutoNext(node.autoNext);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentNodeId, loaded]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading, historyMessages, historyDate]);

    // Nối danh sách bước cố định (nếu node đích có stepsList) vào cuối tin nhắn AI trả về
    const attachStepsIfAny = (nodeId, replyText) => {
        const node = chatbotScripts[nodeId];
        if (!node?.stepsList?.length) return replyText;
        const stepsText = node.stepsList.map((s, i) => `Bước ${i + 1}: ${s}`).join('\n');
        const noteText = node.afterNote ? `\n\n${node.afterNote}` : '';
        return `${replyText}\n\n${stepsText}${noteText}`;
    };

    const handleAutoNext = async (targetNodeId) => {
        setLoading(true);
        try {
            const targetNode = chatbotScripts[targetNodeId];
            const res = await chatbotAPI.interact({
                type: 'auto',
                target_node_id: targetNodeId,
                target_intent: targetNode?.intentSummary || '',
            });
            const content = attachStepsIfAny(res.data.matched_id, res.data.reply);
            setMessages((prev) => [...prev, { sender: 'bot', content, created_at: new Date().toISOString() }]);
            setCurrentNodeId(res.data.matched_id);
        } finally {
            setLoading(false);
        }
    };

        const loadChatDays = async () => {
        try {
            const res = await chatbotAPI.getChatDays();
            setChatDays(res.data.days || []);
        } catch (err) {
            console.error('Lỗi tải danh sách ngày chat:', err);
        }
    };

    const handleSelectDay = async (day) => {
        setShowDaysMenu(false);

        if (day.is_today) {
            setHistoryDate(null);
            return;
        }

        setHistoryLoading(true);
        try {
            const res = await chatbotAPI.getMessagesByDate(day.date);
            setHistoryMessages(res.data.messages || []);
            setHistoryDate(day.date);
        } finally {
            setHistoryLoading(false);
        }
    };

    const autoResizeTextarea = () => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 110) + 'px';
    };

    // Gửi cho AI cả các lựa chọn con trực tiếp lẫn "cháu" (con của con),
    // để AI có thể match thẳng vào ý cụ thể hơn ngay từ node cha (vd: root -> cancel_order.delivery)
    const buildCandidateOptions = (node) => {
        const map = new Map();

        const addOption = (opt) => {
            if (!map.has(opt.id)) {
                map.set(opt.id, {
                    id: opt.id,
                    label: opt.label,
                    intent: opt.intent,
                    targetIntent: chatbotScripts[opt.id]?.intentSummary || opt.intent,
                });
            }
        };

        (node.options || []).forEach((opt) => {
            addOption(opt);
            const childNode = chatbotScripts[opt.id];
            (childNode?.options || []).forEach((childOpt) => addOption(childOpt));
        });

        return Array.from(map.values());
    };

    // Tìm lại object option gốc (để lấy đúng "action") khi matched_id có thể là
    // con trực tiếp hoặc cháu của node hiện tại
    const findOptionByIdRecursive = (node, id) => {
        const direct = (node.options || []).find((o) => o.id === id);
        if (direct) return direct;

        for (const opt of node.options || []) {
            const childNode = chatbotScripts[opt.id];
            const found = (childNode?.options || []).find((o) => o.id === id);
            if (found) return found;
        }
        return null;
    };

    const runNodeAction = (option) => {
        if (!option?.action) return;
        if (option.action.type === 'navigate') {
            navigate(option.action.path);
        } else if (option.action.type === 'logout') {
            logout();
        }
    };

    const handleOptionClick = async (option) => {
        if (loading) return;
        setSuppressOptions(false);
        setSuggestedNav(null);
        setMessages((prev) => [...prev, { sender: 'user', content: option.label, created_at: new Date().toISOString() }]);
        setLoading(true);

        const targetNode = chatbotScripts[option.id];

        try {
            const res = await chatbotAPI.interact({
                type: 'button',
                selected_option_id: option.id,
                selected_label: option.label,
                target_intent: targetNode?.intentSummary || option.intent,
            });
            const content = attachStepsIfAny(res.data.matched_id, res.data.reply);
            setMessages((prev) => [...prev, { sender: 'bot', content, created_at: new Date().toISOString() }]);
            setCurrentNodeId(res.data.matched_id);
            runNodeAction(option);
        } finally {
            setLoading(false);
        }
    };

    const handleTextSubmit = async (e) => {
        e.preventDefault();
        if (loading || historyDate || !inputText.trim()) return;

        const text = inputText.trim();
        setInputText('');
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setMessages((prev) => [...prev, { sender: 'user', content: text, created_at: new Date().toISOString() }]);
        setLoading(true);

        try {
            const res = await chatbotAPI.interact({
                type: 'text',
                user_input: text,
                current_node_intent: currentNode?.intentSummary || '',
                candidate_options: buildCandidateOptions(currentNode),
            });
            const content = attachStepsIfAny(res.data.matched_id, res.data.reply);
            setMessages((prev) => [...prev, { sender: 'bot', content, created_at: new Date().toISOString() }]);

            if (res.data.matched_id && res.data.matched_id !== 'unclear') {
                setSuppressOptions(false);
                setSuggestedNav(null);
                setCurrentNodeId(res.data.matched_id);
                const matchedOption = findOptionByIdRecursive(currentNode, res.data.matched_id);
                runNodeAction(matchedOption);
            } else {
                // AI trả lời tự do (không khớp lựa chọn nào) — ẩn danh sách nút bấm
                // cho lượt này, tránh làm rối khi khách chỉ đang hỏi thông tin.
                setSuppressOptions(true);
                if (res.data.suggested_route) {
                    setSuggestedNav({ route: res.data.suggested_route, label: res.data.suggested_label || 'Tới trang liên quan' });
                } else {
                    setSuggestedNav(null);
                }
            }
        } finally {
            setLoading(false);
        }
    };

    
    const handleTextareaKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleTextSubmit(e);
        }
    };

    if (!isAuthenticated) return null;

    if (!isOpen) {
        return (
            <button style={styles.bubble} onClick={() => setIsOpen(true)} aria-label="Mở chat hỗ trợ">
                💬
            </button>
        );
    }

    return (
        <div style={styles.window}>
            <div style={styles.header}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Hỗ trợ khách hàng</span>
                    <button
                        style={styles.chevronBtn}
                        onClick={() => {
                            const next = !showDaysMenu;
                            setShowDaysMenu(next);
                            if (next) loadChatDays();
                        }}
                        aria-label="Xem đoạn chat theo ngày"
                    >
                        ▾
                    </button>
                    {showDaysMenu && (
                        <div style={styles.daysMenu}>
                            <div style={styles.daysMenuTitle}>Đoạn chat trong 7 ngày gần đây</div>
                            {chatDays.map((day) => (
                                <div key={day.date} style={styles.dayItem} onClick={() => handleSelectDay(day)}>
                                    {day.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <button style={styles.closeBtn} onClick={() => setIsOpen(false)}>✕</button>
            </div>

            <div style={styles.body}>
                {historyDate && (
                    <div style={styles.historyBanner}>
                        Đang xem lại đoạn chat cũ — chỉ xem, không thể nhắn tiếp
                    </div>
                )}

                {(historyDate ? historyMessages : messages).map((msg, idx) => (
                    <div key={idx} style={msg.sender === 'user' ? styles.userMsgRow : styles.botMsgRow}>
                        <div style={msg.sender === 'user' ? styles.userMsg : styles.botMsg}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {historyLoading && (
                    <div style={styles.botMsgRow}>
                        <div style={styles.botMsg}>...</div>
                    </div>
                )}

                {!historyDate && loading && (
                    <div style={styles.botMsgRow}>
                        <div style={styles.botMsg}>...</div>
                    </div>
                )}

                {!historyDate && !loading && !suppressOptions && currentNode?.options?.length > 0 && (
                    <div style={styles.optionsWrap}>
                        {currentNode.options.map((opt) => (
                            <button key={opt.id} style={styles.optionBtn} onClick={() => handleOptionClick(opt)}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}

                {!historyDate && !loading && suggestedNav && (
                    <div style={styles.optionsWrap}>
                        <button
                            style={styles.optionBtn}
                            onClick={() => {
                                navigate(suggestedNav.route);
                                setSuggestedNav(null);
                            }}
                        >
                            {suggestedNav.label}
                        </button>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <form style={styles.inputRow} onSubmit={handleTextSubmit}>
                <textarea
                    ref={inputRef}
                    rows={1}
                    style={styles.textarea}
                    value={inputText}
                    onChange={(e) => { setInputText(e.target.value); autoResizeTextarea(); }}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder={historyDate ? 'Đang xem đoạn chat cũ...' : 'Nhập tin nhắn...'}
                    disabled={loading || !!historyDate}
                />
                <button type="submit" style={styles.sendBtn} disabled={loading || !!historyDate}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </form>
        </div>
    );
};

const styles = {
    bubble: {
        position: 'fixed', bottom: '24px', right: '24px', width: '60px', height: '60px',
        borderRadius: '50%', backgroundColor: '#C0392B', color: 'white', border: 'none',
        fontSize: '26px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 1000,
    },
    window: {
        position: 'fixed', bottom: '24px', right: '24px', width: '340px', height: '460px',
        backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1000,
    },
    header: {
        backgroundColor: '#C0392B', color: 'white', padding: '14px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600,
    },
    closeBtn: { background: 'none', border: 'none', color: 'white', fontSize: '16px', cursor: 'pointer' },
    body: { flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
    userMsgRow: { display: 'flex', justifyContent: 'flex-end' },
    botMsgRow: { display: 'flex', justifyContent: 'flex-start' },
    userMsg: {
        backgroundColor: '#C0392B', color: 'white', padding: '8px 12px',
        borderRadius: '12px 12px 0 12px', maxWidth: '75%', fontSize: '14px', whiteSpace: 'pre-line',
    },
    botMsg: {
        backgroundColor: '#f1f1f1', color: '#333', padding: '8px 12px',
        borderRadius: '12px 12px 12px 0', maxWidth: '75%', fontSize: '14px', whiteSpace: 'pre-line',
    },
    optionsWrap: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' },
    optionBtn: {
        backgroundColor: 'white', border: '1.5px solid #C0392B', color: '#C0392B',
        borderRadius: '8px', padding: '8px 10px', fontSize: '13px', cursor: 'pointer', textAlign: 'left',
    },
    inputRow: { display: 'flex', alignItems: 'flex-end', borderTop: '1px solid #eee', padding: '8px', gap: '6px' },
    input: { flex: 1, border: '1px solid #ddd', borderRadius: '8px', padding: '8px 10px', fontSize: '14px' },
    textarea: {
        flex: 1, border: '1px solid #ddd', borderRadius: '8px', padding: '8px 10px',
        fontSize: '14px', fontFamily: 'inherit', resize: 'none', maxHeight: '110px',
        overflowY: 'auto', lineHeight: '18px',
    },
    chevronBtn: {
        background: 'none', border: 'none', color: 'white', fontSize: '14px',
        cursor: 'pointer', padding: '2px 4px', lineHeight: 1,
    },
    daysMenu: {
        position: 'absolute', top: '26px', left: 0, backgroundColor: 'white',
        borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.2)', width: '220px',
        zIndex: 1001, overflow: 'hidden', color: '#333',
    },
    daysMenuTitle: {
        padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: '#888',
        borderBottom: '1px solid #eee',
    },
    dayItem: {
        padding: '10px 12px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
    },
    historyBanner: {
        backgroundColor: '#fff3cd', color: '#856404', fontSize: '12px', padding: '6px 10px',
        borderRadius: '6px', textAlign: 'center', marginBottom: '4px',
    },
    sendBtn: {
        backgroundColor: '#C0392B', color: 'white', border: 'none', borderRadius: '50%',
        width: '38px', height: '38px', flexShrink: 0, cursor: 'pointer', fontSize: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    },
};

export default ChatbotWidget;