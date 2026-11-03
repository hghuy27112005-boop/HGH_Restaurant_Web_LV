// Keep uploaded message IDs on the job so retries never upload accepted files twice.
export function applyVisualRejection(messages, job, content) {
    const replyId = `${job.id}-rejection`;
    const updated = messages.filter((message) => message.local_id !== replyId).map((message) =>
        message.local_id === job.anchorId ? { ...message, send_status: 'rejected', send_error: null } : message);
    return [...updated, { sender: 'bot', content, local_id: replyId, created_at: new Date().toISOString() }];
}

export async function sendVisualJob(job, api, { onUploaded, onStage }) {
    onStage('uploading');
    for (const image of job.images) {
        if (image.serverId) continue;
        const data = new FormData();
        data.append('image', image.file);
        data.append('ack', '0');
        data.append('caption', job.payload.user_input);
        data.append('lang', job.payload.lang);
        const response = await api.uploadImage(data);
        image.serverId = response.data.message.message_id;
        onUploaded(image, response.data.message);
    }
    onStage('reading');
    return api.interact({ ...job.payload, client_request_id: job.id, visual_message_ids: job.images.map((image) => image.serverId) });
}
