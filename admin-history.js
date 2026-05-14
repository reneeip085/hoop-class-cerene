import { auth, onAuthStateChanged, db, collection, onSnapshot } from "./firebase.js";

const operationList = document.getElementById("operationList");
const noOperation = document.getElementById("noOperation");
const dateFilter = document.getElementById("dateFilter");
const clearDateFilterBtn = document.getElementById("clearDateFilter");
const actionFilter = document.getElementById("actionFilter");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");

const ACTION_LABELS = {
  student_signup: "學生報名",
  student_update_status: "學生更新付款方式",
  student_cancel_booking: "學生取消報名",
  student_join_waitlist: "學生加入等候名單",
  student_cancel_waitlist: "學生取消等候",
  student_promote_from_waitlist: "等候名單自動升位",
  admin_create_class: "Admin 新增班期",
  admin_update_class: "Admin 編輯班期",
  admin_delete_class: "Admin 刪除班期",
  admin_remove_student: "Admin 移除報名人",
};

const RECORDS_PER_PAGE = 50;
let allOperations = [];
let filteredOperations = [];
let currentPage = 0;

function toTime(ts) {
  if (!ts) {
    return "--";
  }
  const d = new Date(ts);
  return d.toLocaleString("zh-HK", { hour12: false });
}

function toDateOnly(ts) {
  if (!ts) {
    return "--";
  }
  const d = new Date(ts);
  return d.toLocaleDateString("zh-HK");
}

function getActionSource(action) {
  return action.startsWith("student_") ? "student" : "admin";
}

function formatDetailText(action, details) {
  const source = getActionSource(action);
  let text = "";

  if (action === "student_signup") {
    const classInfo = details.classHeader || "";
    const levelsInfo = details.levels ? ` ${details.levels}` : "";
    text = `學生: ${details.studentName || "--"} | 班期: ${classInfo}${levelsInfo}`;
  } else if (action === "student_update_status") {
    text = `學生: ${details.studentName || "--"} | 付款方式: ${details.paymentMethod || "--"}`;
  } else if (action === "student_cancel_booking") {
    text = `學生: ${details.studentName || "--"}${details.promotedName ? ` | 已升位: ${details.promotedName}` : ""}`;
  } else if (action === "student_join_waitlist") {
    text = `學生: ${details.studentName || "--"} | 等候位置: ${details.waitlistPosition || "--"}`;
  } else if (action === "student_cancel_waitlist") {
    text = `學生: ${details.studentName || "--"}`;
  } else if (action === "student_promote_from_waitlist") {
    text = `學生: ${details.studentName || "--"}`;
  } else if (action === "admin_create_class") {
    text = `班期: ${details.header || "--"}`;
  } else if (action === "admin_update_class") {
    text = `班期: ${details.header || "--"}`;
  } else if (action === "admin_delete_class") {
    text = `班期 ID: ${details.classId || "--"}`;
  } else if (action === "admin_remove_student") {
    text = `學生: ${details.studentName || "--"} | 班期: ${details.classId || "--"}`;
  }

  return text;
}

function filterOperations() {
  const filterDate = dateFilter.value;
  const filterAction = actionFilter.value;

  filteredOperations = allOperations.filter((op) => {
    if (filterDate) {
      const opDate = toDateOnly(op.createdAt);
      const selectedDate = new Date(filterDate).toLocaleDateString("zh-HK");
      if (opDate !== selectedDate) {
        return false;
      }
    }

    if (filterAction) {
      const opSource = getActionSource(op.action);
      if (opSource !== filterAction) {
        return false;
      }
    }

    return true;
  });

  currentPage = 0;
  render();
}

function renderTableRow(op) {
  const row = document.createElement("tr");

  const timeCell = document.createElement("td");
  timeCell.textContent = toTime(op.createdAt);
  row.appendChild(timeCell);

  const actionCell = document.createElement("td");
  actionCell.textContent = ACTION_LABELS[op.action] || op.action || "未命名";
  row.appendChild(actionCell);

  const sourceCell = document.createElement("td");
  sourceCell.textContent = op.source === "admin" ? "Admin" : "學生";
  row.appendChild(sourceCell);

  const detailCell = document.createElement("td");
  detailCell.textContent = formatDetailText(op.action, op.details || {});
  detailCell.style.wordBreak = "break-word";
  row.appendChild(detailCell);

  return row;
}

function render() {
  const total = filteredOperations.length;
  const totalPages = Math.ceil(total / RECORDS_PER_PAGE);

  if (total === 0) {
    operationList.innerHTML = "";
    noOperation.classList.remove("hidden");
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    pageInfo.textContent = "";
    return;
  }

  noOperation.classList.add("hidden");

  const start = currentPage * RECORDS_PER_PAGE;
  const end = start + RECORDS_PER_PAGE;
  const pageData = filteredOperations.slice(start, end);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["時間", "操作", "來源", "詳情"].forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.textAlign = "left";
    th.style.padding = "8px";
    th.style.borderBottom = "2px solid #ccc";
    th.style.fontWeight = "bold";
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  pageData.forEach((op) => {
    const row = renderTableRow(op);
    row.style.borderBottom = "1px solid #eee";
    [...row.children].forEach((cell) => {
      cell.style.padding = "8px";
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  operationList.innerHTML = "";
  operationList.appendChild(table);

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage >= totalPages - 1;
  pageInfo.textContent = `第 ${currentPage + 1} / ${totalPages} 頁（共 ${total} 條）`;
}

dateFilter.addEventListener("change", filterOperations);
clearDateFilterBtn.addEventListener("click", () => {
  dateFilter.value = "";
  filterOperations();
});
actionFilter.addEventListener("change", filterOperations);

prevBtn.addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage -= 1;
    render();
  }
});

nextBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filteredOperations.length / RECORDS_PER_PAGE);
  if (currentPage < totalPages - 1) {
    currentPage += 1;
    render();
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("請先在 Admin 頁面登入。");
    window.location.href = "admin.html";
    return;
  }

  onSnapshot(collection(db, "operations"), (snapshot) => {
    allOperations = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    filterOperations();
  });
});
