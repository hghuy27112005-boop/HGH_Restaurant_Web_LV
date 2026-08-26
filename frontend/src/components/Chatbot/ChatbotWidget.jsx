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
    const messagesEndRef = useRef(null);

    const currentNode = chatbotScripts[currentNodeId];

    useEffect(() => {
        if (isOpen && !loaded && isAuthenticated) {
            chatbotAPI.getSession().then((res) => {
                const data = res.data;
                setCurrentNodeId(data.current_node_id || 'root');
                setMessages(data.messages || []);
                setLoaded(true);
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
    }, [messages, loading]);

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

    const buildCandidateOptions = (node) =>
        (node.options || []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            intent: opt.intent,
            targetIntent: chatbotScripts[opt.id]?.intentSummary || opt.intent,
        }));

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
        if (loading || !inputText.trim()) return;

        const text = inputText.trim();
        setInputText('');
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
                setCurrentNodeId(res.data.matched_id);
                const matchedOption = (currentNode.options || []).find((o) => o.id === res.data.matched_id);
                runNodeAction(matchedOption);
            } else {
                // AI trả lời tự do (không khớp lựa chọn nào) — ẩn danh sách nút bấm
                // cho lượt này, tránh làm rối khi khách chỉ đang hỏi thông tin.
                setSuppressOptions(true);
            }
        } finally {
            setLoading(false);
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
                <span>Hỗ trợ khách hàng</span>
                <button style={styles.closeBtn} onClick={() => setIsOpen(false)}>✕</button>
            </div>

            <div style={styles.body}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={msg.sender === 'user' ? styles.userMsgRow : styles.botMsgRow}>
                        <div style={msg.sender === 'user' ? styles.userMsg : styles.botMsg}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div style={styles.botMsgRow}>
                        <div style={styles.botMsg}>...</div>
                    </div>
                )}

                {!loading && !suppressOptions && currentNode?.options?.length > 0 && (
                    <div style={styles.optionsWrap}>
                        {currentNode.options.map((opt) => (
                            <button key={opt.id} style={styles.optionBtn} onClick={() => handleOptionClick(opt)}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <form style={styles.inputRow} onSubmit={handleTextSubmit}>
                <input
                    style={styles.input}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    disabled={loading}
                />
                <button type="submit" style={styles.sendBtn} disabled={loading}>Gửi</button>
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
    inputRow: { display: 'flex', borderTop: '1px solid #eee', padding: '8px', gap: '6px' },
    input: { flex: 1, border: '1px solid #ddd', borderRadius: '8px', padding: '8px 10px', fontSize: '14px' },
    sendBtn: {
        backgroundColor: '#C0392B', color: 'white', border: 'none', borderRadius: '8px',
        padding: '8px 14px', cursor: 'pointer', fontSize: '14px',
    },
};

export default ChatbotWidget;