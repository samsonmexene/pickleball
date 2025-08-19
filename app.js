
(() => {
  const STORAGE_KEY = 'offline_ops_v3';
  const $$ = (sel, root=document) => root.querySelector(sel);
  const $$$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2,10);
  const now = () => new Date().toISOString().replace('T',' ').slice(0,19);

  const DEFAULT = {
    users: [
      {id:'u1', username:'site1', password:'site123', role:'site', name:'Site Staff'},
      {id:'u2', username:'office1', password:'office123', role:'office', name:'Office Staff'}
    ],
    currentUser: null,
    inventory: [
      {sku:'COKE-1L:', name:'Coke 1Litre', category:'Soda', unit:'bottle', onhand:50, min:20, max:200},
      {sku:'COKE-330mL', name:'Coke in Can', category:'Soda', unit:'bottle', onhand:120, min:60, max:500},
      {sku:'Gatorade-350o', name:'Gatorade 350mL - Orange', category:'EnergyDrink', unit:'bottle', onhand:35, min:20, max:120}
    ],
    purchaseRequests: [],
    deliveries: [],
    sales: [],
    logs: []
  };

  let state = load();

  // Elements
  const loginView = $('#loginView');
  const mainView  = $('#mainView');
  const loginForm = $('#loginForm');
  const logoutBtn = $('#logoutBtn');
  const currentUserBox = $('#currentUserBox');
  const lowStockBadge = $('#lowStockBadge');

  // Tabs
  const tabs = $('#tabs');
  tabs.addEventListener('click', (e) => {
    if (e.target.matches('button[data-tab]')) {
      $$$('.tabs button').forEach(b=>b.classList.remove('active'));
      e.target.classList.add('active');
      const id = e.target.dataset.tab;
      $$$('.tab').forEach(t=>t.classList.remove('active'));
      $('#' + id).classList.add('active');
    }
  });

  // Login
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = $('#loginUser').value.trim();
    const pass = $('#loginPass').value;
    const found = state.users.find(u => u.username === user && u.password === pass);
    if (!found) { alert('Invalid credentials'); return; }
    state.currentUser = { id: found.id, username: found.username, name: found.name, role: found.role };
    log(`login`, `${found.username} signed in`);
    save();
    showApp();
  });

  logoutBtn.addEventListener('click', () => {
    if (state.currentUser) log('logout', `${state.currentUser.username} signed out`);
    state.currentUser = null; save(); showApp();
  });

  // Inventory UI
  const invSearch = $('#invSearch');
  const itemForm = $('#itemForm');
  const invTableBody = $('#inventoryTable tbody');
  const exportJsonBtn = $('#exportJsonBtn');
  const importJsonInput = $('#importJsonInput');

  invSearch.addEventListener('input', renderInventory);

  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(itemForm);
    const item = {
      sku: (f.get('sku')||'').trim(),
      name: (f.get('name')||'').trim(),
      category: (f.get('category')||'').trim(),
      unit: (f.get('unit')||'').trim() || 'pcs',
      onhand: Number(f.get('onhand')||0),
      min: Number(f.get('min')||0),
      max: Number(f.get('max')||0)
    };
    if (!item.sku) return;
    const existing = state.inventory.find(x => x.sku.toUpperCase() === item.sku.toUpperCase());
    if (existing) {
      Object.assign(existing, item);
      log('inventory.update', `Updated ${item.sku}`);
    } else {
      state.inventory.push(item);
      log('inventory.add', `Added ${item.sku}`);
    }
    save(); itemForm.reset(); renderAll();
  });

  invTableBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-sku]'); if (!tr) return;
    const sku = tr.dataset.sku;
    const item = state.inventory.find(x => x.sku === sku);
    if (!item) return;
    if (e.target.matches('.del')) {
      if (confirm('Delete item?')) {
        state.inventory = state.inventory.filter(x => x.sku !== sku);
        log('inventory.delete', `Deleted ${sku}`);
        save(); renderAll();
      }
    }
    if (e.target.matches('.edit')) {
      fillItemForm(item);
    }
    if (e.target.matches('.add1')) { item.onhand += 1; save(); renderAll(); }
    if (e.target.matches('.sub1')) { item.onhand = Math.max(0, item.onhand - 1); save(); renderAll(); }
  });

  exportJsonBtn.addEventListener('click', () => {
  // Only export inventory, deliveries, sales, PRs, logs
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.inventory), "Inventory");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.purchaseRequests), "PRs");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.deliveries), "Deliveries");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.sales), "Sales");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.logs), "Logs");

  XLSX.writeFile(wb, `backup_${Date.now()}.xlsx`);
});


  importJsonInput.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const wb = XLSX.read(evt.target.result, {type:"binary"});
      const imported = { ...state };

      if (wb.Sheets["Inventory"]) imported.inventory = XLSX.utils.sheet_to_json(wb.Sheets["Inventory"]);
      if (wb.Sheets["PRs"]) imported.purchaseRequests = XLSX.utils.sheet_to_json(wb.Sheets["PRs"]);
      if (wb.Sheets["Deliveries"]) imported.deliveries = XLSX.utils.sheet_to_json(wb.Sheets["Deliveries"]);
      if (wb.Sheets["Sales"]) imported.sales = XLSX.utils.sheet_to_json(wb.Sheets["Sales"]);
      if (wb.Sheets["Logs"]) imported.logs = XLSX.utils.sheet_to_json(wb.Sheets["Logs"]);

      state = imported;
      save(); renderAll();
      alert('Excel import successful!');
    } catch (err) {
      alert('Excel import failed: ' + err.message);
    }
  };
  reader.readAsBinaryString(file);
});


  function fillItemForm(item) {
    itemForm.sku.value = item.sku;
    itemForm.name.value = item.name;
    itemForm.category.value = item.category || '';
    itemForm.unit.value = item.unit || '';
    itemForm.onhand.value = item.onhand;
    itemForm.min.value = item.min || 0;
    itemForm.max.value = item.max || 0;
  }

  function renderInventory() {
    const q = invSearch.value.trim().toLowerCase();
    const rows = state.inventory
      .filter(i => !q || i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      .sort((a,b) => a.sku.localeCompare(b.sku))
      .map(i => {
        const low = i.min && i.onhand <= i.min;
        return `<tr data-sku="${i.sku}">
          <td>${i.sku}</td>
          <td>${i.name}</td>
          <td>${i.category||''}</td>
          <td>${i.unit||''}</td>
          <td class="${low?'bad':''}">${i.onhand}</td>
          <td>${i.min||0}</td>
          <td>${i.max||0}</td>
          <td>
            <button class="chip sub1">-1</button>
            <button class="chip add1">+1</button>
            <button class="chip edit">Edit</button>
            <button class="chip danger del">Delete</button>
          </td>
        </tr>`;
      }).join('');
    invTableBody.innerHTML = rows || `<tr><td colspan="8" class="muted">No items.</td></tr>`;

    // Low-stock badge
    const lowCount = state.inventory.filter(i => i.min && i.onhand <= i.min).length;
    if (lowCount > 0) {
      lowStockBadge.textContent = `${lowCount} low-stock item${lowCount>1?'s':''}`;
      lowStockBadge.classList.remove('hidden');
    } else {
      lowStockBadge.classList.add('hidden');
    }
    renderSelectors();
  }

  // Purchase Requests
  const newPrBtn = $('#newPrBtn');
  const prDialog = $('#prDialog');
  const prItem = $('#prItem');
  const prQty = $('#prQty');
  const addPrLineBtn = $('#addPrLineBtn');
  const submitPrBtn = $('#submitPrBtn');
  const prLines = $('#prLines');
  const prList = $('#prList');

  let draftLines = [];

  newPrBtn.addEventListener('click', () => {
    if (!requireRole('site')) return;
    draftLines = [];
    prQty.value = 1;
    prLines.innerHTML = '';
    prDialog.showModal();
  });

  addPrLineBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const sku = prItem.value;
    const qty = Number(prQty.value||1);
    if (!sku || qty<=0) return;
    const item = state.inventory.find(i => i.sku === sku);
    draftLines.push({ sku, name:item?.name||sku, qty });
    renderDraftLines();
  });

  submitPrBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (draftLines.length === 0) return;
    const pr = { id: uid(), createdAt: now(), status:'pending', lines: draftLines, by: state.currentUser.username };
    state.purchaseRequests.unshift(pr);
    log('pr.create', `PR ${pr.id} created with ${pr.lines.length} line(s)`);
    save(); renderPRs(); prDialog.close();
  });

  function renderDraftLines() {
    prLines.innerHTML = draftLines.map((l, idx) => 
      `<span class="chip">${l.sku} × ${l.qty} <span class="remove" data-i="${idx}">✕</span></span>`
    ).join('');
  }
  prLines.addEventListener('click', (e) => {
    if (e.target.matches('.remove')) {
      draftLines.splice(Number(e.target.dataset.i),1);
      renderDraftLines();
    }
  });

  function renderPRs() {
    prList.innerHTML = state.purchaseRequests.map(pr => {
      const statusClr = pr.status==='approved'?'ok':(pr.status==='rejected'?'bad':'muted');
      const actions = (state.currentUser?.role==='office' && pr.status==='pending')
        ? `<div class="row">
            <button class="primary approve" data-id="${pr.id}">Approve</button>
            <button class="danger reject" data-id="${pr.id}">Reject</button>
          </div>`
        : '';
      const lines = pr.lines.map(l => `<li>${l.sku} — <strong>${l.qty}</strong></li>`).join('');
      return `<div class="card">
        <div class="row" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>PR #${pr.id}</h3>
          <span class="${statusClr}">${pr.status}</span>
        </div>
        <p class="muted">Created ${pr.createdAt} by ${pr.by}</p>
        <ul>${lines}</ul>
        ${actions}
      </div>`;
    }).join('') || `<div class="muted">No purchase requests yet.</div>`;
  }

  prList.addEventListener('click', (e) => {
    if (e.target.matches('.approve')) {
      const id = e.target.dataset.id;
      const pr = state.purchaseRequests.find(x => x.id === id);
      if (!pr) return;
      pr.status = 'approved';
      pr.approvedAt = now(); pr.approvedBy = state.currentUser.username;
      log('pr.approve', `PR ${id} approved`);
      save(); renderPRs();
    }
    if (e.target.matches('.reject')) {
      const id = e.target.dataset.id;
      const pr = state.purchaseRequests.find(x => x.id === id);
      if (!pr) return;
      pr.status = 'rejected';
      pr.rejectedAt = now(); pr.rejectedBy = state.currentUser.username;
      log('pr.reject', `PR ${id} rejected`);
      save(); renderPRs();
    }
  });

  // Deliveries
  const delivForm = $('#delivForm');
  const delivItem = $('#delivItem');
  const delivQty = $('#delivQty');
  const delivRef = $('#delivRef');
  const delivTableBody = $('#delivTable tbody');

  delivForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const sku = delivItem.value; const qty = Number(delivQty.value||0);
    if (!sku || qty<=0) return;
    const ref = delivRef.value.trim() || 'N/A';
    const item = state.inventory.find(i => i.sku === sku);
    if (!item) return;
    item.onhand += qty;
    const rec = { id: uid(), at: now(), sku, name:item.name, qty, ref, by: state.currentUser.username };
    state.deliveries.unshift(rec);
    log('delivery', `Delivery ${ref} — ${sku} × ${qty}`);
    delivForm.reset(); save(); renderAll();
  });

  function renderDeliveries() {
    delivTableBody.innerHTML = state.deliveries.map(d =>
      `<tr><td>${d.at}</td><td>${d.ref}</td><td>${d.sku}</td><td>${d.qty}</td><td>${d.by}</td></tr>`
    ).join('') || `<tr><td colspan="5" class="muted">No deliveries yet.</td></tr>`;
  }

  // Sales
  const saleForm = $('#saleForm');
  const saleItem = $('#saleItem');
  const saleQty = $('#saleQty');
  const salesTableBody = $('#salesTable tbody');

  saleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const sku = saleItem.value; const qty = Number(saleQty.value||0);
    if (!sku || qty<=0) return;
    const item = state.inventory.find(i => i.sku === sku);
    if (!item) return;
    if (item.onhand < qty) { alert('Insufficient stock'); return; }
    item.onhand -= qty;
    const rec = { id: uid(), at: now(), sku, name:item.name, qty, by: state.currentUser.username };
    state.sales.unshift(rec);
    log('sale', `Sold ${sku} × ${qty}`);
    saleForm.reset(); save(); renderAll();
  });

  function renderSales() {
    salesTableBody.innerHTML = state.sales.map(s =>
      `<tr><td>${s.at}</td><td>${s.sku}</td><td>${s.qty}</td><td>${s.by}</td></tr>`
    ).join('') || `<tr><td colspan="4" class="muted">No sales recorded.</td></tr>`;
  }

  // Logs
  const logsTableBody = $('#logsTable tbody');
  function log(type, message) {
    state.logs.unshift({ id: uid(), at: now(), user: state.currentUser?.username||'system', type, message });
    save();
  }
  function renderLogs() {
    logsTableBody.innerHTML = state.logs.map(l =>
      `<tr><td>${l.at}</td><td>${l.user}</td><td>${l.message}</td></tr>`
    ).join('') || `<tr><td colspan="3" class="muted">No logs yet.</td></tr>`;
  }

  // Helpers
  function renderSelectors() {
    const opts = state.inventory.map(i => `<option value="${i.sku}">${i.sku} — ${i.name}</option>`).join('');
    ['prItem','delivItem','saleItem'].forEach(id => { const el = $('#'+id); if (el) el.innerHTML = opts; });
  }

  function requireRole(role) {
    if (!state.currentUser) return false;
    if (state.currentUser.role !== role) {
      alert(`This action requires ${role.toUpperCase()} role.`);
      return false;
    }
    return true;
  }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
      const parsed = JSON.parse(raw);
      // migrate minimal fields if missing
      return Object.assign(JSON.parse(JSON.stringify(DEFAULT)), parsed);
    } catch { return JSON.parse(JSON.stringify(DEFAULT)); }
  }

  function showApp() {
    if (state.currentUser) {
      loginView.classList.add('hidden');
      mainView.classList.remove('hidden');
      currentUserBox.textContent = `${state.currentUser.name} (${state.currentUser.role})`;
      renderAll();
    } else {
      loginView.classList.remove('hidden');
      mainView.classList.add('hidden');
      $('#loginUser').focus();
    }
  }

  function renderAll() {
    renderInventory();
    renderPRs();
    renderDeliveries();
    renderSales();
    renderLogs();
  }

  // Boot
  const $ids = new Proxy({}, { get: (_, id) => document.getElementById(id) });
  function $(sel) { return document.querySelector(sel); }
  showApp();
})();
