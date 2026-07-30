const db = window.supabase.createClient(window.APP_CONFIG.url, window.APP_CONFIG.key);
const form = document.querySelector("#ticketForm");
const errorBox = document.querySelector("#error");
async function sendFeishu(ticket) {
  if (!window.APP_CONFIG.submitWebhook) return;
  const text = `【新工单通知】\n工单ID: ${ticket.id || "新提交"}\n工单标题: ${ticket.title || "-"}\n问题描述: ${ticket.description || "-"}\n提交人姓名: ${ticket.name || "-"}\n联系电话: ${ticket.phone || "-"}\n优先级: ${ticket.priority || "medium"}\n状态: 待处理`;
  try {
    await fetch(window.APP_CONFIG.submitWebhook, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({msg_type:"text",content:{text}})
    });
  } catch {}
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#submitButton");
  button.disabled = true; button.textContent = "提交中..."; errorBox.hidden = true;
  const payload = {
    version: 2,
    description: document.querySelector("#description").value.trim(),
    legacy_id: null,
    tracks: []
  };
  const name = document.querySelector("#name").value.trim();
  const title = document.querySelector("#title").value.trim();
  const phone = document.querySelector("#phone").value.trim();
  const email = document.querySelector("#email").value.trim();
  const priority = document.querySelector("#priority").value;
  payload.tracks.push({action:"create",content:"工单已创建",operator:name,created_at:new Date().toISOString()});
  const { data, error } = await db.from("tickets_type2").insert({title,description:JSON.stringify(payload),name,phone,email,priority,status:"pending"}).select("id").single();
  if (error) { errorBox.textContent = "提交失败，请稍后重试"; errorBox.hidden = false; }
  else { void sendFeishu({id:data?.id,title,description:payload.description,name,phone,priority}); form.reset(); document.querySelector("#formView").hidden = true; document.querySelector("#successView").hidden = false; }
  button.disabled = false; button.textContent = "提交工单";
});
document.querySelector("#againButton").addEventListener("click",()=>{document.querySelector("#successView").hidden=true;document.querySelector("#formView").hidden=false;});
