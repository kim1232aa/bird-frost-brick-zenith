(function () {
  var existing = document.getElementById("tapnow-shortcuts-help");
  if (existing) return;

  var rows = [
    ["移动画布", "按住空格拖拽，或直接拖拽空白区域"],
    ["缩放画布", "鼠标滚轮 / 触控板双指缩放"],
    ["粘贴图片", "Ctrl/⌘ + V"],
    ["撤销", "Ctrl/⌘ + Z"],
    ["重做", "Ctrl/⌘ + Shift + Z"],
    ["删除选中", "Backspace；Windows 可用 Delete；Mac 可用 fn + Delete"],
    ["退出/关闭", "Esc"],
    ["确认输入", "Enter，部分输入框内 Shift + Enter 换行"],
  ];

  var style = document.createElement("style");
  style.id = "tapnow-shortcuts-style";
  style.textContent = [
    "#tapnow-shortcuts-help{position:fixed;right:18px;bottom:18px;z-index:99999;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    "#tapnow-shortcuts-help button{font:inherit}",
    ".tapnow-shortcuts-btn{height:34px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(24,24,27,.82);color:#fff;padding:0 12px;font-size:12px;box-shadow:0 10px 28px rgba(0,0,0,.22);backdrop-filter:blur(10px);cursor:pointer}",
    ".tapnow-shortcuts-btn:hover{background:rgba(39,39,42,.94)}",
    ".tapnow-shortcuts-panel{position:absolute;right:0;bottom:44px;width:min(360px,calc(100vw - 28px));border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(18,18,20,.96);color:#f4f4f5;box-shadow:0 22px 70px rgba(0,0,0,.38);backdrop-filter:blur(16px);overflow:hidden}",
    ".tapnow-shortcuts-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1);font-size:13px;font-weight:700}",
    ".tapnow-shortcuts-close{border:0;background:transparent;color:#a1a1aa;cursor:pointer;font-size:18px;line-height:1}",
    ".tapnow-shortcuts-close:hover{color:#fff}",
    ".tapnow-shortcuts-body{padding:10px 14px 12px}",
    ".tapnow-shortcuts-row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:12px;padding:7px 0;font-size:12px;line-height:1.5;border-bottom:1px solid rgba(255,255,255,.07)}",
    ".tapnow-shortcuts-row:last-child{border-bottom:0}",
    ".tapnow-shortcuts-action{color:#a1a1aa}",
    ".tapnow-shortcuts-key{color:#fff}",
    ".tapnow-shortcuts-note{margin-top:8px;color:#a1a1aa;font-size:11px;line-height:1.6}",
  ].join("");
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.id = "tapnow-shortcuts-help";

  var button = document.createElement("button");
  button.type = "button";
  button.className = "tapnow-shortcuts-btn";
  button.textContent = "快捷键";
  button.setAttribute("aria-expanded", "false");

  var panel = document.createElement("div");
  panel.className = "tapnow-shortcuts-panel";
  panel.hidden = true;
  panel.innerHTML =
    '<div class="tapnow-shortcuts-head"><span>快捷键说明</span><button type="button" class="tapnow-shortcuts-close" aria-label="关闭">×</button></div>' +
    '<div class="tapnow-shortcuts-body">' +
    rows
      .map(function (row) {
        return '<div class="tapnow-shortcuts-row"><div class="tapnow-shortcuts-action">' + row[0] + '</div><div class="tapnow-shortcuts-key">' + row[1] + "</div></div>";
      })
      .join("") +
    '<div class="tapnow-shortcuts-note">提示：如果光标正在输入框里，删除键会优先删除文字，不会删除画布节点。需要先点选节点或空白处。</div>' +
    "</div>";

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  button.addEventListener("click", function (event) {
    event.stopPropagation();
    setOpen(panel.hidden);
  });
  panel.querySelector(".tapnow-shortcuts-close").addEventListener("click", function () {
    setOpen(false);
  });
  document.addEventListener("pointerdown", function (event) {
    if (!root.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setOpen(false);
  });

  root.appendChild(panel);
  root.appendChild(button);
  document.body.appendChild(root);
})();
