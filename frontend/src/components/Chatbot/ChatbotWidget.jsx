import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatbotAPI } from '@/services/chatbotApi';
import { useAuthContext } from '@/context/AuthContext';
import chatbotScripts from '@/data/chatbot_customer_scripts';

const ChatbotWidget = ({ isOpen, setIsOpen }) => {
    const navigate = useNavigate();
    const { logout, isAuthenticated } = useAuthContext();

    const [loaded, setLoaded] = useState(false);
    const [currentNodeId, setCurrentNodeId] = useState('root');
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [suppressOptions, setSuppressOptions] = useState(false);
    const [suggestedNav, setSuggestedNav] = useState(null); // { route, label } | null
    const [moderationBlocked, setModerationBlocked] = useState(false);
    const [moderationMessage, setModerationMessage] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const imageInputRef = useRef(null);
    const [pendingImages, setPendingImages] = useState([]);

    // Xem lại đoạn chat cũ theo ngày (chỉ xem, không nhắn được)
    const [historyDate, setHistoryDate] = useState(null); // null = đang ở đoạn chat live hôm nay
    const [historyMessages, setHistoryMessages] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [chatDays, setChatDays] = useState([]);
    const [imageGroups, setImageGroups] = useState([]);
    const [imagesExpanded, setImagesExpanded] = useState(true);
    const [showDaysMenu, setShowDaysMenu] = useState(false);
    const [actionDate, setActionDate] = useState(null);
    const [deleteDate, setDeleteDate] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [imageError, setImageError] = useState('');
    const [previewIndex, setPreviewIndex] = useState(null);
    const chatBodyRef = useRef(null);

    const currentNode = chatbotScripts[currentNodeId];
    const previewImages = Array.from(new Map([
        ...imageGroups.flatMap((group) => group.images.map((image) => ({
            url: image.image_url,
            name: image.filename,
            label: image.filename || 'Ảnh trong thư viện',
        }))),
        ...(historyDate ? historyMessages : messages)
            .filter((message) => message.image_url)
            .map((message, index) => ({
                url: message.image_url,
                name: message.filename || `chat-image-${index + 1}.png`,
                label: 'Ảnh trong tin nhắn',
            })),
        ...pendingImages.map((image, index) => ({
            url: image.url,
            name: image.file.name || `pending-image-${index + 1}.png`,
            label: `Ảnh chờ gửi ${index + 1}`,
        })),
    ].map((image) => [image.url, image])).values());
    const currentPreview = previewIndex === null ? null : previewImages[previewIndex] || null;

    const scrollChatToBottom = () => {
        const node = chatBodyRef.current;
        if (!node) return;

        node.scrollTop = node.scrollHeight;
    };

    useEffect(() => {
        if (isOpen && !loaded && isAuthenticated) {
            chatbotAPI.getSession().then((res) => {
                const data = res.data;
                const nodeId = data.current_node_id || 'root';
                setCurrentNodeId(nodeId);
                setMessages(data.messages || []);
                setModerationBlocked(Boolean(data.moderation?.blocked));
                if (data.moderation?.blocked) {
                    setModerationMessage('Quý khách đã bị tạm khóa chatbot và đánh giá đến hết ngày do đã vi phạm quy tắc ngôn từ 2 lần trong hôm nay.');
                }
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
        if (!isOpen || showDaysMenu || historyDate) return;

        requestAnimationFrame(scrollChatToBottom);
        const timeoutId = setTimeout(scrollChatToBottom, 120);
        return () => clearTimeout(timeoutId);
    }, [isOpen, showDaysMenu, historyDate, messages.length, loading]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePaste = (event) => {
            if (loading || historyDate || moderationBlocked) return;
            const clipboardItems = Array.from(event.clipboardData?.items || []);
            const imageItem = clipboardItems.find((item) => item.type.startsWith('image/'));
            const hasFile = clipboardItems.some((item) => item.kind === 'file');
            if (!imageItem) {
                if (hasFile) setImageError('Chỉ có thể nhận hình ảnh trong khung chat.');
                return;
            }

            event.preventDefault();
            const file = imageItem.getAsFile();
            if (file) addPendingImages([file]);
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isOpen, loading, historyDate, moderationBlocked]);

    useEffect(() => {
        if (previewIndex === null) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setPreviewIndex(null);
            if (event.key === 'ArrowLeft') setPreviewIndex((index) => Math.max(0, index - 1));
            if (event.key === 'ArrowRight') setPreviewIndex((index) => Math.min(previewImages.length - 1, index + 1));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [previewIndex, previewImages.length]);

    const openImageViewer = (imageUrl) => {
        const index = previewImages.findIndex((image) => image.url === imageUrl);
        if (index !== -1) setPreviewIndex(index);
    };

    const downloadPreviewImage = () => {
        if (!currentPreview) return;
        const link = document.createElement('a');
        link.href = currentPreview.url;
        link.download = currentPreview.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const buildBotMessages = (nodeId, replyText) => {
        const node = chatbotScripts[nodeId];
        const replyParts = String(replyText || '')
            .split(/(?<=[.!?。！？])\s+/u)
            .map((part) => part.trim())
            .filter(Boolean);
        const contents = replyParts.length > 0 ? replyParts : [String(replyText || '')];

        if (node?.stepsList?.length) {
            contents.push(...node.stepsList.map((step, index) => `Bước ${index + 1}: ${step}`));
        }

        if (node?.afterNote) {
            contents.push(node.afterNote);
        }

        return contents.filter(Boolean);
    };

    const appendBotMessages = (nodeId, replyText) => {
        const botMessages = buildBotMessages(nodeId, replyText).map((content) => ({
            sender: 'bot',
            content,
            created_at: new Date().toISOString(),
        }));
        setMessages((prev) => [...prev, ...botMessages]);
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
            appendBotMessages(res.data.matched_id, res.data.reply);
            setCurrentNodeId(res.data.matched_id);
        } finally {
            setLoading(false);
        }
    };

        const loadChatDays = async () => {
        try {
                const [daysResponse, imagesResponse] = await Promise.all([
                    chatbotAPI.getChatDays(),
                    chatbotAPI.getImagesByDate(),
                ]);
                setChatDays(daysResponse.data.days || []);
                setImageGroups(imagesResponse.data.images || []);
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

    const handleDeleteHistory = async () => {
        if (!deleteDate || deleteLoading) return;

        setDeleteLoading(true);
        try {
            await chatbotAPI.deleteMessagesByDate(deleteDate);
            setChatDays((days) => days.filter((day) => day.date !== deleteDate));
            if (historyDate === deleteDate) {
                setHistoryDate(null);
                setHistoryMessages([]);
            }
            if (deleteDate === new Date().toISOString().slice(0, 10)) {
                setMessages([]);
                setCurrentNodeId('root');
            }
            setDeleteDate(null);
        } catch (err) {
            console.error('Lỗi xóa lịch sử chatbot:', err);
        } finally {
            setDeleteLoading(false);
        }
    };

    const autoResizeTextarea = () => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 110) + 'px';
    };

    const addPendingImages = (files) => {
        const selectedFiles = Array.from(files || []);
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'heif', 'svg'];
        const isImageFile = (file) => {
            const extension = file.name?.split('.').pop()?.toLowerCase();
            return imageExtensions.includes(extension);
        };
        const invalidFile = selectedFiles.find((file) => !isImageFile(file));
        if (invalidFile) {
            setImageError('Chỉ có thể nhận hình ảnh trong khung chat.');
        }

        const imageFiles = selectedFiles.filter(isImageFile);
        if (imageFiles.length === 0) return;

        setPendingImages((current) => [
            ...current,
            ...imageFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
        ]);
    };

    const handleImageSelected = async (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files?.length || loading || historyDate || moderationBlocked) return;
        addPendingImages(files);
    };

    const sendPendingImage = async () => {
        if (pendingImages.length === 0 || loading) return;
        if (pendingImages.length > 5) {
            setImageError('Bạn chỉ có thể gửi tối đa 5 hình ảnh trong một lần.');
            return;
        }

        setLoading(true);
        try {
            const uploadedMessages = [];
            for (const pendingImage of pendingImages) {
                const formData = new FormData();
                formData.append('image', pendingImage.file);
                const response = await chatbotAPI.uploadImage(formData);
                uploadedMessages.push(response.data.message);
                URL.revokeObjectURL(pendingImage.url);
            }
            setMessages((prev) => [...prev, ...uploadedMessages]);
            setPendingImages([]);
        } catch (error) {
            setImageError(error.response?.data?.message || 'Không thể lưu hình ảnh. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
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
            navigate(option.action.path, { state: option.action.state });
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
            appendBotMessages(res.data.matched_id, res.data.reply);
            setCurrentNodeId(res.data.matched_id);
            runNodeAction(option);
        } finally {
            setLoading(false);
        }
    };

    const handleTextSubmit = async (e) => {
        e.preventDefault();
        if (loading || historyDate || moderationBlocked || !inputText.trim()) return;

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
            appendBotMessages(res.data.matched_id, res.data.reply);

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
                    const route = res.data.suggested_route;
                    if (route.startsWith('/dish-details/')) {
                        navigate(route);
                        setSuggestedNav(null);
                    } else {
                        setSuggestedNav({ route, label: res.data.suggested_label || 'Tới trang liên quan' });
                    }
                } else {
                    setSuggestedNav(null);
                }
            }
        } catch (err) {
            const data = err.response?.data;
            if (data?.warning || data?.blocked) {
                setModerationMessage(data.message);
                setModerationBlocked(Boolean(data.blocked));
                setMessages((prev) => [...prev, {
                    sender: 'bot',
                    content: data.message,
                    created_at: new Date().toISOString(),
                }]);
            } else {
                console.error('Lỗi gửi tin nhắn chatbot:', err);
            }
        } finally {
            setLoading(false);
        }
    };

    
    const handleTextareaKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
        }
    };

    const handleHistoryMenuToggle = () => {
        const next = !showDaysMenu;
        setShowDaysMenu(next);

        if (!next) {
            setHistoryDate(null);
            setHistoryMessages([]);
            requestAnimationFrame(scrollChatToBottom);
            setTimeout(scrollChatToBottom, 150);
        }

        if (next) {
            loadChatDays();
        }
    };

    if (!isAuthenticated) return null;

    return (
        <>
            <style>{`
                @keyframes pageSlideIn {
                    from {
                        opacity: 0.35;
                        transform: translateX(28px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                @keyframes pageSlideOut {
                    from {
                        opacity: 0.35;
                        transform: translateX(-28px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
            `}</style>
            {!isOpen && (
                <button style={styles.bubble} onClick={() => setIsOpen(true)} aria-label="Mở chat hỗ trợ">
                    <img src="/pics/chatbot.png" alt="" style={styles.bubbleIcon} />
                </button>
            )}
            {isOpen && (
            <div style={styles.window}>
            <div style={styles.header}>
                <div style={styles.headerControls}>
                    <button
                        style={styles.menuBtn}
                        onClick={handleHistoryMenuToggle}
                        aria-label="Xem đoạn chat theo ngày"
                    >
                        <span style={styles.menuIcon} aria-hidden="true">
                            <span style={styles.menuIconBar} />
                            <span style={styles.menuIconBar} />
                            <span style={styles.menuIconBar} />
                        </span>
                    </button>
                </div>
                <button style={styles.closeBtn} onClick={() => setIsOpen(false)}>✕</button>
            </div>

            {showDaysMenu ? (
                <div style={styles.screenWrapper}>
                    <div style={{ ...styles.historyScreen, ...styles.pageSlideIn }}>
                        <div style={styles.historyHeadingRow}>
                            <div style={{ ...styles.historyHeading, padding: 0 }}>Hình ảnh</div>
                            <button
                                type="button"
                                style={styles.collapseImagesBtn}
                                onClick={() => setImagesExpanded((expanded) => !expanded)}
                                aria-label={imagesExpanded ? 'Thu gọn mục hình ảnh' : 'Mở rộng mục hình ảnh'}
                                aria-expanded={imagesExpanded}
                                title={imagesExpanded ? 'Thu gọn hình ảnh' : 'Mở rộng hình ảnh'}
                            >
                                <span style={{ ...styles.collapseTriangle, transform: imagesExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                            </button>
                        </div>
                        {imagesExpanded && (
                            <div style={styles.imageHistoryList}>
                                {imageGroups.length === 0 ? (
                                    <div style={styles.emptyHistory}>Chưa có hình ảnh đã gửi.</div>
                                ) : imageGroups.map((group) => (
                                    <section key={group.date} style={styles.imageDayGroup}>
                                        <div style={styles.imageDayTitle}>{group.label}</div>
                                        <div style={styles.imageGrid}>
                                            {group.images.map((image) => (
                                                <button
                                                    key={image.filename}
                                                    type="button"
                                                    style={styles.historyImageButton}
                                                    onClick={() => openImageViewer(image.image_url)}
                                                    aria-label={`Xem ảnh ${image.filename}`}
                                                    title={image.filename}
                                                >
                                                    <img src={image.image_url} alt={image.filename} style={styles.historyImage} />
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}
                        <div style={styles.historyHeading}>Lịch sử chat</div>
                        <div style={styles.historyList}>
                            {chatDays.length === 0 ? (
                                <div style={styles.emptyHistory}>Chưa có lịch sử chat.</div>
                            ) : chatDays.map((day) => (
                                <div key={day.date} style={styles.dayItem}>
                                    <button style={styles.dayLabel} onClick={() => handleSelectDay(day)}>
                                        {day.label}
                                    </button>
                                    <button
                                        style={styles.moreBtn}
                                        onClick={() => setActionDate(actionDate === day.date ? null : day.date)}
                                        aria-label={`Tùy chọn ${day.label}`}
                                    >
                                        ⋯
                                    </button>
                                    {actionDate === day.date && (
                                        <button
                                            style={styles.deleteHistoryAction}
                                            onClick={() => {
                                                setActionDate(null);
                                                setDeleteDate(day.date);
                                            }}
                                        >
                                            Xóa lịch sử chat
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div style={styles.screenWrapper}>
                        <div ref={chatBodyRef} style={{ ...styles.body, ...styles.pageSlideOut }}>
                            {moderationMessage && (
                                <div style={styles.moderationBanner}>{moderationMessage}</div>
                            )}
                        {historyDate && (
                            <div style={styles.historyBanner}>
                                Đang xem lại đoạn chat cũ — chỉ xem, không thể nhắn tiếp
                            </div>
                        )}

                        {(historyDate ? historyMessages : messages).map((msg, idx) => (
                            <div key={idx} style={msg.sender === 'user' ? styles.userMsgRow : styles.botMsgRow}>
                                <div style={msg.sender === 'user' ? styles.userMsg : styles.botMsg}>
                                    {msg.image_url && (
                                        <button
                                            type="button"
                                            style={styles.chatImagePreviewButton}
                                            onClick={() => openImageViewer(msg.image_url)}
                                            aria-label="Xem ảnh đã gửi"
                                        >
                                            <img src={msg.image_url} alt="Ảnh đã gửi" style={styles.chatImage} />
                                        </button>
                                    )}
                                    {msg.content && msg.content !== '[Hình ảnh]' && (
                                        <div>{msg.content}</div>
                                    )}
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

                        {!historyDate && !loading && !moderationBlocked && !suppressOptions && currentNode?.options?.length > 0 && (
                            <div style={styles.optionsWrap}>
                                {currentNode.options.map((opt) => (
                                    <button key={opt.id} style={styles.optionBtn} onClick={() => handleOptionClick(opt)}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {!historyDate && !loading && !moderationBlocked && suggestedNav && (
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

                        {pendingImages.length > 0 && (
                            <div style={styles.pendingImageRow}>
                                {pendingImages.map((pendingImage, index) => (
                                    <div key={pendingImage.url} style={styles.pendingImageItem}>
                                        <button
                                            type="button"
                                            style={styles.pendingPreviewButton}
                                            onClick={() => openImageViewer(pendingImage.url)}
                                            aria-label={`Xem ảnh chờ gửi ${index + 1}`}
                                        >
                                            <img src={pendingImage.url} alt="" style={styles.pendingImage} />
                                        </button>
                                        <button
                                            type="button"
                                            style={styles.removeImageBtn}
                                            onClick={() => {
                                                URL.revokeObjectURL(pendingImage.url);
                                                setPendingImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <form style={styles.inputRow} onSubmit={(event) => {
                            event.preventDefault();
                            if (pendingImages.length > 0) sendPendingImage();
                            else handleTextSubmit(event);
                        }}>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.avif,.heic,.heif,.svg"
                                multiple
                                onChange={handleImageSelected}
                                style={styles.hiddenInput}
                            />
                            <button
                                type="button"
                                style={styles.uploadBtn}
                                onClick={() => imageInputRef.current?.click()}
                                disabled={loading || !!historyDate || moderationBlocked}
                                aria-label="Tải ảnh lên"
                                title="Tải ảnh lên"
                            >
                                <svg viewBox="0 0 24 24" style={styles.plusSvg} aria-hidden="true">
                                    <path d="M12 4v16M4 12h16" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                                </svg>
                            </button>
                            <textarea
                                ref={inputRef}
                                rows={1}
                                style={styles.textarea}
                                value={inputText}
                                onChange={(e) => { setInputText(e.target.value); autoResizeTextarea(); }}
                                onKeyDown={handleTextareaKeyDown}
                                placeholder={historyDate ? 'Đang xem đoạn chat cũ...' : 'Nhập tin nhắn...'}
                                disabled={loading || !!historyDate || moderationBlocked}
                            />
                            <button type="submit" style={styles.sendBtn} disabled={loading || !!historyDate || moderationBlocked}>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                </svg>
                            </button>
                        </form>
                    </div>
                </>
            )}

            {deleteDate && (
                <div style={styles.modalBackdrop} onClick={() => !deleteLoading && setDeleteDate(null)}>
                    <div style={styles.deleteModal} onClick={(event) => event.stopPropagation()}>
                        <h2 style={styles.modalTitle}>Xóa lịch sử chat?</h2>
                        <p style={styles.modalText}>
                            Lịch sử chat ngày {new Date(`${deleteDate}T00:00:00`).toLocaleDateString('vi-VN')} sẽ bị xóa vĩnh viễn.
                        </p>
                        <div style={styles.modalActions}>
                            <button
                                style={styles.cancelBtn}
                                onClick={() => setDeleteDate(null)}
                                disabled={deleteLoading}
                            >
                                Hủy
                            </button>
                            <button
                                style={styles.deleteBtn}
                                onClick={handleDeleteHistory}
                                disabled={deleteLoading}
                            >
                                {deleteLoading ? 'Đang xóa...' : 'Xóa lịch sử chat'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {imageError && (
                <div style={styles.imageErrorBackdrop} onClick={() => setImageError('')}>
                    <div style={styles.imageErrorModal} onClick={(event) => event.stopPropagation()}>
                        <div style={styles.imageErrorIcon}>!</div>
                        <h2 style={styles.imageErrorTitle}>Không thể gửi hình ảnh</h2>
                        <p style={styles.imageErrorText}>{imageError}</p>
                        <button style={styles.deleteBtn} onClick={() => setImageError('')}>Đã hiểu</button>
                    </div>
                </div>
            )}
            </div>
            )}
            {currentPreview && (
                <div style={styles.imagePreviewBackdrop} role="dialog" aria-modal="true" aria-label="Trình xem ảnh">
                    <div style={styles.imageViewerToolbar}>
                        <button type="button" style={styles.imageViewerAction} onClick={downloadPreviewImage} aria-label="Tải ảnh xuống" title="Tải ảnh xuống">
                            <svg viewBox="0 0 24 24" style={styles.imageViewerIcon} aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 17v4h14v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                        <button type="button" style={styles.imageViewerAction} onClick={() => setPreviewIndex(null)} aria-label="Đóng trình xem ảnh" title="Đóng">
                            <svg viewBox="0 0 24 24" style={styles.imageViewerIcon} aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                        </button>
                    </div>
                    <button
                        type="button"
                        style={{ ...styles.imageViewerArrow, ...styles.imageViewerArrowLeft }}
                        onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}
                        disabled={previewIndex === 0}
                        aria-label="Ảnh trước"
                    >
                        <svg viewBox="0 0 24 24" style={styles.imageViewerIcon} aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <div style={styles.imageViewerStage}>
                        <img src={currentPreview.url} alt={currentPreview.label} style={styles.imagePreviewFull} />
                    </div>
                    <button
                        type="button"
                        style={{ ...styles.imageViewerArrow, ...styles.imageViewerArrowRight }}
                        onClick={() => setPreviewIndex((index) => Math.min(previewImages.length - 1, index + 1))}
                        disabled={previewIndex === previewImages.length - 1}
                        aria-label="Ảnh tiếp theo"
                    >
                        <svg viewBox="0 0 24 24" style={styles.imageViewerIcon} aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <div style={styles.imageViewerThumbnails} aria-label="Danh sách ảnh">
                        {previewImages.map((image, index) => (
                            <button
                                key={`${image.url}-${index}`}
                                type="button"
                                style={{ ...styles.imageViewerThumbnail, ...(index === previewIndex ? styles.imageViewerThumbnailActive : {}) }}
                                onClick={() => setPreviewIndex(index)}
                                aria-label={`Xem ${image.label.toLowerCase()} ${index + 1}`}
                                aria-current={index === previewIndex ? 'true' : undefined}
                            >
                                <img src={image.url} alt="" style={styles.imageViewerThumbnailImage} />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
};

const styles = {
    bubble: {
        position: 'fixed', bottom: '24px', right: '24px', width: '62px', height: '62px',
        borderRadius: '50%', backgroundColor: '#dc2626', color: 'white', border: 'none',
        cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px',
    },
    bubbleIcon: { width: '100%', height: '100%', objectFit: 'contain', filter: 'hue-rotate(135deg) saturate(1.35)' },
    window: {
        position: 'fixed', inset: '0 0 0 auto', width: 'clamp(320px, 24vw, 420px)',
        backgroundColor: 'white', borderLeft: '1px solid #e5e7eb', boxShadow: '-8px 0 24px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1000,
    },
    header: {
        backgroundColor: 'white', color: '#dc2626', padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600,
    },
    headerControls: { display: 'flex', alignItems: 'center' },
    closeBtn: { background: 'none', border: 'none', color: '#dc2626', fontSize: '22px', cursor: 'pointer', padding: '2px 6px' },
    body: { flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
    screenWrapper: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
    pageSlideIn: {
        animation: 'pageSlideIn 260ms ease-out forwards',
        width: '100%', height: '100%',
    },
    pageSlideOut: {
        animation: 'pageSlideOut 260ms ease-in forwards',
        width: '100%', height: '100%',
    },
    userMsgRow: { display: 'flex', justifyContent: 'flex-end' },
    botMsgRow: { display: 'flex', justifyContent: 'flex-start' },
    userMsg: {
        backgroundColor: '#dc2626', color: 'white', padding: '8px 12px',
        borderRadius: '12px 12px 0 12px', maxWidth: '75%', fontSize: '14px', whiteSpace: 'pre-line',
    },
    botMsg: {
        backgroundColor: '#f1f1f1', color: '#333', padding: '8px 12px',
        borderRadius: '12px 12px 12px 0', maxWidth: '75%', fontSize: '14px', whiteSpace: 'pre-line',
    },
    chatImage: { display: 'block', width: 'min(240px, 100%)', maxHeight: '280px', objectFit: 'contain', borderRadius: '8px' },
    chatImagePreviewButton: { display: 'block', maxWidth: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
    optionsWrap: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' },
    optionBtn: {
        backgroundColor: 'white', border: '1.5px solid #dc2626', color: '#dc2626',
        borderRadius: '8px', padding: '8px 10px', fontSize: '13px', cursor: 'pointer', textAlign: 'left',
    },
    inputRow: { display: 'flex', alignItems: 'flex-end', borderTop: '1px solid #eee', padding: '8px', gap: '6px' },
    hiddenInput: { display: 'none' },
    mediaBtn: { minWidth: '34px', height: '32px', flexShrink: 0, border: '1px solid #dc2626', borderRadius: '7px', background: 'white', color: '#dc2626', fontSize: '12px', fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '0 6px' },
    uploadBtn: {
        width: '34px', height: '34px', minWidth: '34px', flexShrink: 0,
        border: 'none', borderRadius: '8px',
        backgroundColor: '#dc2626', color: '#ffffff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0, lineHeight: 1,
        boxShadow: 'none',
    },
    plusSvg: {
        width: '18px', height: '18px', display: 'block',
        stroke: '#ffffff', overflow: 'visible',
    },
    pendingImageRow: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignSelf: 'stretch', margin: '8px 12px 0', padding: '6px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#f3f4f6' },
    pendingImageItem: { position: 'relative', display: 'inline-flex' },
    pendingPreviewButton: { display: 'block', padding: 0, border: 'none', borderRadius: '5px', background: 'transparent', cursor: 'pointer' },
    pendingImage: { display: 'block', width: '90px', height: '70px', objectFit: 'cover', borderRadius: '5px' },
    removeImageBtn: { position: 'absolute', top: '-9px', right: '-9px', width: '22px', height: '22px', border: '1px solid #d1d5db', borderRadius: '50%', background: 'white', color: '#dc2626', fontSize: '18px', lineHeight: 1, cursor: 'pointer' },
    input: { flex: 1, border: '1px solid #ddd', borderRadius: '8px', padding: '8px 10px', fontSize: '14px' },
    textarea: {
        flex: 1, border: '1px solid #ddd', borderRadius: '8px', padding: '8px 10px',
        fontSize: '14px', fontFamily: 'inherit', resize: 'none', maxHeight: '110px',
        overflowY: 'auto', lineHeight: '18px',
    },
    menuBtn: {
        background: 'white', border: '2px solid #dc2626', color: '#dc2626',
        borderRadius: '12px', cursor: 'pointer', padding: '8px 10px', lineHeight: 1,
    },
    menuIcon: { display: 'flex', flexDirection: 'column', gap: '4px', width: '20px' },
    menuIconBar: { display: 'block', width: '20px', height: '2px', backgroundColor: '#dc2626' },
    historyScreen: { flex: 1, minHeight: 0, backgroundColor: '#fafafa', overflowY: 'auto', padding: '18px 10px' },
    historyHeading: { color: '#dc2626', fontSize: '18px', fontWeight: 700, padding: '0 6px 16px' },
    historyHeadingRow: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', padding: '0 4px 12px 6px' },
    collapseImagesBtn: { width: '20px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', background: 'transparent', color: '#dc2626', cursor: 'pointer', padding: 0 },
    collapseTriangle: { width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid currentColor', transition: 'transform 160ms ease' },
    historyList: { display: 'flex', flexDirection: 'column' },
    imageHistoryList: { marginBottom: '22px' },
    imageDayGroup: { marginBottom: '14px' },
    imageDayTitle: { color: '#4b5563', fontSize: '13px', fontWeight: 600, padding: '4px 6px 8px' },
    imageGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', padding: '0 6px' },
    historyImageButton: { display: 'block', width: '100%', padding: 0, border: 'none', borderRadius: '7px', background: 'transparent', cursor: 'pointer' },
    historyImage: { display: 'block', width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '7px', border: '1px solid #e5e7eb' },
    emptyHistory: { color: '#6b7280', fontSize: '13px', padding: '8px 6px' },
    dayItem: {
        position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '8px',
        borderBottom: '1px solid #f5f5f5',
    },
    dayLabel: { flex: 1, background: 'none', border: 'none', color: '#333', textAlign: 'left', padding: '10px 6px', fontSize: '13px', cursor: 'pointer' },
    moreBtn: { background: 'none', border: 'none', color: '#dc2626', fontSize: '22px', lineHeight: 1, padding: '4px 8px', cursor: 'pointer' },
    deleteHistoryAction: { position: 'absolute', right: '8px', top: '38px', zIndex: 3, background: 'white', border: '1px solid #dc2626', borderRadius: '8px', boxShadow: '0 5px 14px rgba(0, 0, 0, 0.18)', color: '#dc2626', fontSize: '13px', padding: '10px 14px', cursor: 'pointer', whiteSpace: 'nowrap' },
    historyBanner: {
        backgroundColor: '#fff3cd', color: '#856404', fontSize: '12px', padding: '6px 10px',
        borderRadius: '6px', textAlign: 'center', marginBottom: '4px',
    },
    moderationBanner: {
        backgroundColor: '#fff3cd', color: '#856404', fontSize: '12px', padding: '8px 10px',
        borderRadius: '6px', textAlign: 'center', marginBottom: '4px',
    },
    sendBtn: {
        backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '50%',
        width: '38px', height: '38px', flexShrink: 0, cursor: 'pointer', fontSize: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    },
    modalBackdrop: { position: 'absolute', inset: 0, zIndex: 1002, backgroundColor: 'rgba(127, 29, 29, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' },
    deleteModal: { width: '100%', backgroundColor: 'white', border: '2px solid #dc2626', borderRadius: '14px', boxShadow: '0 12px 30px rgba(127, 29, 29, 0.3)', padding: '20px' },
    modalTitle: { color: '#b91c1c', fontSize: '20px', margin: '0 0 10px' },
    modalText: { color: '#374151', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px' },
    cancelBtn: { background: 'white', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '7px', padding: '8px 14px', cursor: 'pointer' },
    deleteBtn: { background: '#dc2626', color: 'white', border: '1px solid #dc2626', borderRadius: '7px', padding: '8px 14px', cursor: 'pointer' },
    imageErrorBackdrop: { position: 'absolute', inset: 0, zIndex: 1004, background: 'rgba(0, 0, 0, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' },
    imagePreviewBackdrop: { position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', flexDirection: 'column', background: '#17181c', color: 'white' },
    imageViewerToolbar: { position: 'absolute', top: '18px', right: '22px', zIndex: 2, display: 'flex', gap: '10px' },
    imageViewerAction: { width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,0.48)', color: 'white', cursor: 'pointer' },
    imageViewerIcon: { width: '22px', height: '22px', display: 'block' },
    imageViewerArrow: { position: 'absolute', top: '50%', zIndex: 2, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(-50%)', border: 'none', borderRadius: '50%', background: 'rgba(255,255,255,0.72)', color: '#17181c', cursor: 'pointer' },
    imageViewerArrowLeft: { left: '20px' },
    imageViewerArrowRight: { right: '20px' },
    imageViewerStage: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '72px 70px 14px', boxSizing: 'border-box' },
    imagePreviewFull: { display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
    imageViewerThumbnails: { height: '82px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', overflowX: 'auto', padding: '8px 18px 14px', boxSizing: 'border-box' },
    imageViewerThumbnail: { width: '60px', height: '52px', flex: '0 0 auto', padding: '2px', overflow: 'hidden', border: '1px solid transparent', borderRadius: '6px', background: 'rgba(255,255,255,0.18)', cursor: 'pointer' },
    imageViewerThumbnailActive: { borderColor: '#60a5fa', background: 'rgba(96,165,250,0.45)' },
    imageViewerThumbnailImage: { display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: '3px' },
    imageErrorModal: { width: '100%', maxWidth: '320px', background: 'white', border: '2px solid #dc2626', borderRadius: '12px', boxShadow: '0 10px 28px rgba(0, 0, 0, 0.25)', padding: '20px', textAlign: 'center' },
    imageErrorIcon: { width: '34px', height: '34px', margin: '0 auto 10px', borderRadius: '50%', background: '#dc2626', color: 'white', fontSize: '24px', fontWeight: 700, lineHeight: '34px' },
    imageErrorTitle: { margin: '0 0 8px', color: '#b91c1c', fontSize: '18px' },
    imageErrorText: { margin: '0 0 18px', color: '#374151', fontSize: '14px', lineHeight: 1.5 },
};

export default ChatbotWidget;