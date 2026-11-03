// One shared script is used by the widget and server (including button validation).
// Free-text advice is grounded in website_knowledge.txt with recent conversation
// context; it offers a navigation button only after the next step is clear.
// Keep button IDs/translation keys stable; avoid autoNext for routine guidance.
import scripts from '../../../backend/resources/chatbot/script_nodes.json';
export default scripts;
