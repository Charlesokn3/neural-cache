/* 
   Neural Cache - Budget Tracker
   app.js
 */

// - Supabase config -
var SUPABASE_URL = 'https://kidowzxxiccozyphwtyf.supabase.co';
var SUPABASE_KEY = 'sb_publishable_N0fTBExIwe_RC4qVbTI5fw_jtN0Q8Gw';
var SITE_URL = 'https://charlesokn3.github.io/neural-cache';
var sb          = null;
var currentUser = null;

// - Local state -
var txType           = 'income';
var sidebarCollapsed = false;
var toastTimer       = null;
var clearPending     = false;
var clearTimer       = null;
var editingTxId      = null;
var data             = { tx: [], goals: [] };


// BOOT - init Supabase then check auth

function boot() {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  sb.auth.getSession().then(function(res) {
    var session = res.data.session;
    if (session) {
      currentUser = session.user;
      showApp();
    } else {
      showAuth();
    }
  });

  // Listen for auth changes (login / logout)
  sb.auth.onAuthStateChange(function(event, session) {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      showApp();
      // Show confirmation message if coming from email verification
      if (window.location.hash.indexOf('type=signup') !== -1 ||
          window.location.hash.indexOf('type=recovery') !== -1) {
        setTimeout(function() {
          notify('// email confirmed! welcome to neural cache.', 'ok');
        }, 800);
      }
    } else if (event === 'USER_UPDATED') {
      notify('// email confirmed! you can now sign in.', 'ok');
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      data = { tx: [], goals: [] };
      showAuth();
    }
  });
}


// AUTH SCREEN

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display  = 'none';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'flex';
  document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('user-email').textContent = currentUser.email;
  updatePeriodChip();
  loadAll();
}

function authSubmit() {
  var email = document.getElementById('auth-email').value.trim();
  var pass  = document.getElementById('auth-pass').value;
  var isLogin = document.getElementById('auth-mode').dataset.mode === 'login';

  if (!email || !pass) { notify('// enter email and password.'); return; }

  var btn = document.getElementById('auth-btn');
  btn.textContent = '// loading...';
  btn.disabled = true;

  var promise = isLogin
    ? sb.auth.signInWithPassword({ email: email, password: pass })
    : sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: SITE_URL } });
   
  promise.then(function(res) {
    btn.disabled = false;
    btn.textContent = isLogin ? 'Sign In' : 'Create Account';
    if (res.error) {
      notify('// error: ' + res.error.message);
    } else if (!isLogin) {
      // Show a clear message and update the UI to guide the user
      document.getElementById('auth-title').textContent = '// check_your_email';
      document.getElementById('auth-btn').style.display = 'none';
      document.getElementById('auth-switch-btn').style.display = 'none';
      document.querySelector('.auth-switch').innerHTML =
        '<span style="color:var(--cyan)">// confirmation email sent.</span><br>' +
        '<span style="color:var(--text3)">click the link in your email then come back and sign in.</span>';
      notify('// check your email for a confirmation link.', 'ok');
    }
  });
}

function toggleAuthMode() {
  var modeEl = document.getElementById('auth-mode');
  var isLogin = modeEl.dataset.mode === 'login';
  modeEl.dataset.mode = isLogin ? 'signup' : 'login';
  document.getElementById('auth-title').textContent    = isLogin ? '// create_account' : '// sign_in';
  document.getElementById('auth-btn').textContent      = isLogin ? 'Create Account' : 'Sign In';
  document.getElementById('auth-btn').style.display    = '';
  document.getElementById('auth-switch-btn').style.display = '';
  document.getElementById('auth-switch-text').textContent = isLogin ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('auth-switch-btn').textContent  = isLogin ? 'Sign in' : 'Create one';
}

function signOut() {
  sb.auth.signOut();
}


// DATABASE - load all data

function loadAll() {
  Promise.all([
    sb.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: false }),
    sb.from('goals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true })
  ]).then(function(results) {
    var txRes    = results[0];
    var goalsRes = results[1];

    if (txRes.error)    { notify('// error loading transactions: ' + txRes.error.message); return; }
    if (goalsRes.error) { notify('// error loading goals: ' + goalsRes.error.message); return; }

    // Map DB rows to app format
    data.tx = txRes.data.map(function(row) {
      return {
        id:       row.id,
        desc:     row.description,
        amt:      parseFloat(row.amount),
        type:     row.type,
        cat:      row.category,
        split:    row.split,
        date:     row.date,
        goalId:   row.goal_id,
        goalName: row.goal_name
      };
    });

    data.goals = goalsRes.data.map(function(row) {
      return { id: row.id, name: row.name, target: parseFloat(row.target) };
    });

    renderTx();
    renderPiggy();
  });
}

// - Save a transaction to Supabase -
function saveTx(tx) {
  return sb.from('transactions').insert({
    id:          tx.id,
    user_id:     currentUser.id,
    description: tx.desc,
    amount:      tx.amt,
    type:        tx.type,
    category:    tx.cat,
    split:       tx.split,
    date:        tx.date,
    goal_id:     tx.goalId   || null,
    goal_name:   tx.goalName || null
  });
}

// - Update an existing transaction in Supabase -
function updateTxInDB(tx) {
  return sb.from('transactions').update({
    description: tx.desc,
    amount:      tx.amt,
    category:    tx.cat,
    split:       tx.split,
    date:        tx.date
  }).eq('id', tx.id).eq('user_id', currentUser.id);
}

// - Delete a transaction from Supabase -
function deleteTxFromDB(id) {
  return sb.from('transactions').delete().eq('id', id).eq('user_id', currentUser.id);
}

// - Save a goal to Supabase -
function saveGoal(goal) {
  return sb.from('goals').insert({
    id:      goal.id,
    user_id: currentUser.id,
    name:    goal.name,
    target:  goal.target
  });
}

// - Delete a goal from Supabase -
function deleteGoalFromDB(id) {
  return sb.from('goals').delete().eq('id', id).eq('user_id', currentUser.id);
}


// TOAST

function notify(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type === 'ok' ? ' ok' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, 4000);
}


// PERIOD

function getPeriod() { return document.getElementById('period-select').value; }

function getPeriodRange() {
  var n = new Date(); var start = new Date(); var p = getPeriod();
  if (p === 'weekly')        start.setDate(n.getDate() - 7);
  else if (p === 'biweekly') start.setDate(n.getDate() - 14);
  else                       start = new Date(n.getFullYear(), n.getMonth(), 1);
  start.setHours(0,0,0,0);
  return { start: start, end: n };
}

function inPeriod(dateStr) {
  var range = getPeriodRange();
  var d = new Date(dateStr + 'T00:00');
  return d >= range.start && d <= range.end;
}

function updatePeriodChip() {
  var p = getPeriod(); var n = new Date();
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (p === 'monthly') {
    document.getElementById('period-chip').textContent = mo[n.getMonth()] + ' ' + n.getFullYear();
  } else {
    var range = getPeriodRange();
    document.getElementById('period-chip').textContent =
      mo[range.start.getMonth()] + ' ' + range.start.getDate() + ' - ' + mo[n.getMonth()] + ' ' + n.getDate();
  }
}

function onPeriodChange() { updatePeriodChip(); renderTx(); }


// BALANCE HELPERS

function getTotalIncome() {
  return data.tx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+t.amt; },0);
}
function getTotalSpent() {
  return data.tx.filter(function(t){ return t.type==='expense'||t.type==='goal'; }).reduce(function(s,t){ return s+t.amt; },0);
}
function getCurrentBalance() { return getTotalIncome() - getTotalSpent(); }

function getSplitPcts() {
  return {
    needs:   (parseFloat(document.getElementById('pct-needs').value)   ||0)/100,
    wants:   (parseFloat(document.getElementById('pct-wants').value)   ||0)/100,
    savings: (parseFloat(document.getElementById('pct-savings').value) ||0)/100
  };
}

function getBucketRemaining(bucket) {
  var ptx = data.tx.filter(function(t){ return inPeriod(t.date); });
  var inc = ptx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+t.amt; },0);
  var pcts = getSplitPcts();
  var pct  = bucket==='needs'?pcts.needs:bucket==='wants'?pcts.wants:pcts.savings;
  var alloc = inc * pct;
  var used  = bucket==='savings'
    ? ptx.filter(function(t){ return (t.type==='expense'&&t.split==='piggy')||t.type==='goal'; }).reduce(function(s,t){ return s+t.amt; },0)
    : ptx.filter(function(t){ return t.type==='expense'&&t.split===bucket; }).reduce(function(s,t){ return s+t.amt; },0);
  return { alloc:alloc, used:used, remaining:Math.max(0, alloc-used) };
}


// SIDEBAR

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('main').classList.toggle('expanded', sidebarCollapsed);
  document.getElementById('toggle-arrow').setAttribute('points',
    sidebarCollapsed ? '9 9 5 12 9 15' : '15 9 19 12 15 15');
}


// TABS

function switchTab(tab, el) {
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('panel-tx').style.display    = tab==='tx'    ? 'block' : 'none';
  document.getElementById('panel-piggy').style.display = tab==='piggy' ? 'block' : 'none';
  document.getElementById('page-title').textContent    = tab==='tx' ? 'Transactions' : 'Piggy Bank';
  if (tab==='piggy') renderPiggy();
  if (tab==='tx')    renderTx();
}


// TRANSACTION FORM

function setType(t) {
  txType = t;
  document.getElementById('btn-inc').classList.toggle('on', t==='income');
  document.getElementById('btn-exp').classList.toggle('on', t==='expense');
  var cat = document.getElementById('t-cat');
  cat.innerHTML = t==='income'
    ? '<option>Salary</option><option>Freelance</option><option>Investment</option><option>Other</option>'
    : '<option>Food</option><option>Transport</option><option>Housing</option><option>Entertainment</option><option>Health</option><option>Shopping</option><option>Other</option>';
  document.getElementById('split-field').style.display = t==='expense' ? 'block' : 'none';
  document.getElementById('piggy-hint').style.display  = 'none';
}

function onSplitSelect() {
  document.getElementById('piggy-hint').style.display =
    document.getElementById('t-split').value === 'piggy' ? 'block' : 'none';
}

function addTx() {
  var desc  = document.getElementById('t-desc').value.trim();
  var amt   = parseFloat(document.getElementById('t-amt').value);
  var cat   = document.getElementById('t-cat').value;
  var date  = document.getElementById('t-date').value;
  var split = txType==='expense' ? document.getElementById('t-split').value : null;

  if (!desc||isNaN(amt)||amt<=0) { notify('// error: fill in description and amount.'); return; }

  if (txType==='expense') {
    var balance = getCurrentBalance();
    if (balance<=0) { notify('// blocked: no balance.\nAdd income before making expenses.'); return; }
    if (amt>balance) { notify('// blocked: exceeds balance.\nYou have '+fmt(balance)+' available.'); return; }
    if (split==='needs'||split==='wants') {
      var bkt = getBucketRemaining(split);
      if (bkt.alloc===0) { notify('// blocked: no income this period.\nAdd income to fund your '+split+' bucket.'); return; }
      if (amt>bkt.remaining) { notify('// blocked: exceeds '+split+' budget.\n'+fmt(bkt.remaining)+' left this period.'); return; }
    }
    if (split==='piggy') {
      var sbkt = getBucketRemaining('savings');
      if (sbkt.alloc===0) { notify('// blocked: no savings budget.\nAdd income first.'); return; }
      if (amt>sbkt.remaining) { notify('// blocked: exceeds savings budget.\n'+fmt(sbkt.remaining)+' left this period.'); return; }
      playCoinSound();
    }
  }

  var tx = { id:Date.now(), desc:desc, amt:amt, type:txType, cat:cat, date:date, split:split };
  saveTx(tx).then(function(res) {
    if (res.error) { notify('// error saving: '+res.error.message); return; }
    data.tx.unshift(tx);
    renderTx();
    document.getElementById('t-desc').value = '';
    document.getElementById('t-amt').value  = '';
    document.getElementById('piggy-hint').style.display = 'none';
    notify('// transaction added.', 'ok');
  });
}

function delTx(id) {
  var tx = data.tx.find(function(t){ return t.id===id; });
  if (tx && tx.type==='income') {
    var newIncome  = getTotalIncome() - tx.amt;
    var totalSpent = getTotalSpent();
    if (newIncome < totalSpent) {
      notify('// blocked: deleting this would cause a deficit of '+fmt(totalSpent-newIncome)+'.\nRemove some expenses first.');
      return;
    }
  }
  deleteTxFromDB(id).then(function(res) {
    if (res.error) { notify('// error deleting: '+res.error.message); return; }
    data.tx = data.tx.filter(function(t){ return t.id!==id; });
    renderTx(); renderPiggy();
  });
}

// Edit transaction (inline)
function startEditTx(id) {
  var tx = data.tx.find(function(t){ return t.id===id; });
  if (!tx || tx.type === 'goal') { notify('// this entry is managed from the piggy bank tab.'); return; }
  editingTxId = id;
  renderTx();
}

function cancelEditTx() {
  editingTxId = null;
  renderTx();
}

function saveEditTx(id) {
  var tx = data.tx.find(function(t){ return t.id===id; });
  if (!tx) return;

  var desc  = document.getElementById('e-desc-'+id).value.trim();
  var amt   = parseFloat(document.getElementById('e-amt-'+id).value);
  var cat   = document.getElementById('e-cat-'+id) ? document.getElementById('e-cat-'+id).value : tx.cat;
  var date  = document.getElementById('e-date-'+id).value;
  var split = document.getElementById('e-split-'+id) ? document.getElementById('e-split-'+id).value : tx.split;

  if (!desc || isNaN(amt) || amt<=0 || !date) { notify('// error: fill in all fields correctly.'); return; }

  if (tx.type === 'expense') {
    var balanceWithoutThis = getCurrentBalance() + tx.amt;
    if (amt > balanceWithoutThis) {
      notify('// blocked: exceeds balance.\nMax available for this edit is '+fmt(balanceWithoutThis)+'.');
      return;
    }
  }
  if (tx.type === 'income') {
    var spentTotal = getTotalSpent();
    var incomeWithoutThis = getTotalIncome() - tx.amt;
    if (incomeWithoutThis + amt < spentTotal) {
      notify('// blocked: this change would cause a deficit.\nIncrease the amount or remove some expenses first.');
      return;
    }
  }

  var updated = { id:id, desc:desc, amt:amt, cat:cat, date:date, split:split, type:tx.type };

  updateTxInDB(updated).then(function(res){
    if (res.error) { notify('// error updating: '+res.error.message); return; }
    tx.desc  = desc;
    tx.amt   = amt;
    tx.cat   = cat;
    tx.date  = date;
    tx.split = split;
    editingTxId = null;
    renderTx();
    renderPiggy();
    notify('// transaction updated.', 'ok');
  });
}

// SPLIT RENDERING

function onSplitChange() {
  var n=parseFloat(document.getElementById('pct-needs').value)||0;
  var w=parseFloat(document.getElementById('pct-wants').value)||0;
  var s=parseFloat(document.getElementById('pct-savings').value)||0;
  document.getElementById('split-warn').textContent=(n+w+s)!==100?'// total: '+(n+w+s)+'% ≠ 100%':'';
  renderSplit();
}

function renderSplit() {
  var ptx=data.tx.filter(function(t){ return inPeriod(t.date); });
  var inc=ptx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+t.amt; },0);
  var pcts=getSplitPcts();
  var allocN=inc*pcts.needs, allocW=inc*pcts.wants, allocS=inc*pcts.savings;
  var usedN=ptx.filter(function(t){ return t.type==='expense'&&t.split==='needs'; }).reduce(function(s,t){ return s+t.amt; },0);
  var usedW=ptx.filter(function(t){ return t.type==='expense'&&t.split==='wants'; }).reduce(function(s,t){ return s+t.amt; },0);
  var usedS=ptx.filter(function(t){ return (t.type==='expense'&&t.split==='piggy')||t.type==='goal'; }).reduce(function(s,t){ return s+t.amt; },0);
  function setBar(id,pct,over){ var el=document.getElementById(id); el.style.width=pct+'%'; el.classList.toggle('over',over); }
  setBar('bar-needs',  allocN>0?Math.min(100,(usedN/allocN)*100):0, usedN>allocN);
  setBar('bar-wants',  allocW>0?Math.min(100,(usedW/allocW)*100):0, usedW>allocW);
  setBar('bar-savings',allocS>0?Math.min(100,(usedS/allocS)*100):0, usedS>allocS);
  document.getElementById('used-needs').textContent   =fmt(usedN);
  document.getElementById('used-wants').textContent   =fmt(usedW);
  document.getElementById('used-savings').textContent =fmt(usedS);
  document.getElementById('alloc-needs').textContent  ='/ '+fmt(allocN);
  document.getElementById('alloc-wants').textContent  ='/ '+fmt(allocW);
  document.getElementById('alloc-savings').textContent='/ '+fmt(allocS);
}


// RENDER TRANSACTIONS

function fmt(n){ return '$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function renderTx() {
  var ptx=data.tx.filter(function(t){ return inPeriod(t.date); });
  var inc=ptx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+t.amt; },0);
  var exp=ptx.filter(function(t){ return (t.type==='expense'&&t.split!=='piggy')||t.type==='goal'; }).reduce(function(s,t){ return s+t.amt; },0);
  var pig=ptx.filter(function(t){ return t.type==='expense'&&t.split==='piggy'; }).reduce(function(s,t){ return s+t.amt; },0);
  var bal=inc-exp-pig;

  document.getElementById('s-inc').textContent=fmt(inc);
  document.getElementById('s-exp').textContent=fmt(exp);
  document.getElementById('s-pig').textContent=fmt(pig);
  var bEl=document.getElementById('s-bal');
  bEl.textContent=(bal<0?'-':'')+fmt(bal);
  bEl.className='stat-val'+(bal>0?' g':bal<0?' r':' a');
  renderSplit();

  var allTx=data.tx.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
  var list=document.getElementById('tx-list');
  if (!allTx.length){ list.innerHTML='<div class="empty">no_transactions_found</div>'; return; }

  var groups={};
  allTx.forEach(function(t){ if(!groups[t.date]) groups[t.date]=[]; groups[t.date].push(t); });
  var dates=Object.keys(groups).sort(function(a,b){ return b.localeCompare(a); });

  function dotCls(t){ return t.type==='income'?'g':((t.type==='expense'&&t.split==='piggy')||t.type==='goal')?'p':'r'; }
  function amtCls(t){ return t.type==='income'?'g':((t.type==='expense'&&t.split==='piggy')||t.type==='goal')?'p':'r'; }
  function amtSign(t){ return t.type==='income'?'+':'-'; }
  function iconHtml(t){
    if(t.type==='income') return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
    if((t.type==='expense'&&t.split==='piggy')||t.type==='goal') return '<span style="font-size:14px">'+(t.type==='goal'?'🎯':'🐷')+'</span>';
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
  }
  function tagText(t){
    if(t.type==='expense'&&t.split==='piggy') return 'piggy bank // savings';
    if(t.type==='goal') return (t.goalName||'savings goal')+' // expense';
    if(t.split) return t.cat+' // '+t.split;
    return t.cat;
  }

  var incomeCats  = ['Salary','Freelance','Investment','Other'];
  var expenseCats = ['Food','Transport','Housing','Entertainment','Health','Shopping','Other'];

  function catOptions(t) {
    var cats = t.type==='income' ? incomeCats : expenseCats;
    return cats.map(function(c){
      return '<option'+(c===t.cat?' selected':'')+'>'+c+'</option>';
    }).join('');
  }

  function splitOptions(t) {
    var opts = [['needs','Needs'],['wants','Wants'],['piggy','Piggy Bank']];
    return opts.map(function(o){
      return '<option value="'+o[0]+'"'+(o[0]===t.split?' selected':'')+'>'+o[1]+'</option>';
    }).join('');
  }

  function renderRow(t) {
    if (editingTxId === t.id) {
      var splitField = t.type==='expense'
        ? '<select id="e-split-'+t.id+'" class="edit-input">'+splitOptions(t)+'</select>'
        : '';
      return '<div class="tx-row tx-row-editing">'+
        '<div class="edit-grid">'+
          '<input type="text" id="e-desc-'+t.id+'" class="edit-input" value="'+t.desc.replace(/"/g,'&quot;')+'" placeholder="Description">'+
          '<input type="number" id="e-amt-'+t.id+'" class="edit-input" value="'+t.amt+'" min="0.01" step="0.01" placeholder="Amount">'+
          '<select id="e-cat-'+t.id+'" class="edit-input">'+catOptions(t)+'</select>'+
          splitField+
          '<input type="date" id="e-date-'+t.id+'" class="edit-input" value="'+t.date+'">'+
        '</div>'+
        '<div class="edit-actions">'+
          '<button class="edit-save-btn" onclick="saveEditTx('+t.id+')">Save</button>'+
          '<button class="edit-cancel-btn" onclick="cancelEditTx()">Cancel</button>'+
        '</div>'+
      '</div>';
    }
    var canEdit = t.type !== 'goal';
    return '<div class="tx-row">'+
      '<div class="tx-dot '+dotCls(t)+'">'+iconHtml(t)+'</div>'+
      '<div><div class="tx-name">'+t.desc+'</div><div class="tx-cat">'+tagText(t)+'</div></div>'+
      '<div class="tx-amt '+amtCls(t)+'">'+amtSign(t)+fmt(t.amt)+'</div>'+
      '<div class="tx-row-actions">'+
        (canEdit ? '<button class="edit" onclick="startEditTx('+t.id+')" aria-label="Edit">&#9998;</button>' : '') +
        '<button class="del" onclick="delTx('+t.id+')" aria-label="Delete">&#x2715;</button>'+
      '</div>'+
      '</div>';
  }

  list.innerHTML=dates.map(function(date){
    var rows=groups[date].map(renderRow).join('');
    return '<div class="tx-group-hdr">'+date+'</div>'+rows;
  }).join('');
}


// PIGGY BANK

function renderPiggy() {
  var piggyTotal=data.tx.filter(function(t){ return t.type==='expense'&&t.split==='piggy'; }).reduce(function(s,t){ return s+t.amt; },0);
  document.getElementById('piggy-total').textContent=fmt(piggyTotal);
  var goalsTotal=data.goals.reduce(function(s,g){ return s+getGoalSaved(g.id); },0);
  document.getElementById('goals-total').textContent=fmt(goalsTotal);

  var piggyTxs=data.tx.filter(function(t){ return t.type==='expense'&&t.split==='piggy'; });
  var piggyList=document.getElementById('piggy-tx-list');
  piggyList.innerHTML=!piggyTxs.length
    ? '<div class="empty">no piggy bank deposits yet</div>'
    : piggyTxs.map(function(t){
        return '<div class="tx-row">'+
          '<div class="tx-dot p"><span style="font-size:14px">🐷</span></div>'+
          '<div><div class="tx-name">'+t.desc+'</div><div class="tx-cat">'+t.date+'</div></div>'+
          '<div class="tx-amt p">-'+fmt(t.amt)+'</div>'+
          '<button class="del" onclick="delTx('+t.id+')" aria-label="Delete">&#x2715;</button>'+
          '</div>';
      }).join('');
  renderGoals();
}


// SAVINGS GOALS

function getGoalSaved(id){
  return data.tx.filter(function(t){ return t.type==='goal'&&t.goalId===id; }).reduce(function(s,t){ return s+t.amt; },0);
}

function addGoal() {
  var name  =document.getElementById('g-name').value.trim();
  var target=parseFloat(document.getElementById('g-target').value);
  if(!name||isNaN(target)||target<=0){ notify('// enter a goal name and target amount.'); return; }
  var goal={ id:Date.now(), name:name, target:target };
  saveGoal(goal).then(function(res){
    if(res.error){ notify('// error saving goal: '+res.error.message); return; }
    data.goals.push(goal);
    renderGoals();
    document.getElementById('g-name').value='';
    document.getElementById('g-target').value='';
  });
}

function delGoal(id) {
  Promise.all([
    deleteGoalFromDB(id),
    sb.from('transactions').delete().eq('goal_id', id).eq('user_id', currentUser.id)
  ]).then(function(results) {
    if(results[0].error){ notify('// error deleting goal: '+results[0].error.message); return; }
    data.goals=data.goals.filter(function(g){ return g.id!==id; });
    data.tx=data.tx.filter(function(t){ return !(t.type==='goal'&&t.goalId===id); });
    renderGoals(); renderTx();
  });
}

function contribute(id) {
  var input=document.getElementById('c-'+id);
  var amt=parseFloat(input.value);
  if(isNaN(amt)||amt<=0){ notify('// enter a valid amount.'); return; }

  var g=data.goals.find(function(g){ return g.id===id; });
  if(!g) return;

  var balance=getCurrentBalance();
  if(balance<=0){ notify('// blocked: no balance.\nAdd income before contributing to goals.'); return; }
  if(amt>balance){ notify('// blocked: exceeds balance.\nYou have '+fmt(balance)+' available.'); return; }

  var savBucket=getBucketRemaining('savings');
  if(savBucket.alloc===0){ notify('// blocked: no savings budget this period.\nAdd income first.'); return; }
  if(amt>savBucket.remaining){ notify('// blocked: exceeds savings budget.\n'+fmt(savBucket.remaining)+' left this period.'); return; }

  var alreadySaved=getGoalSaved(id);
  var capped=Math.min(amt, g.target-alreadySaved);
  if(capped<=0){ notify('// goal already complete!'); return; }

  var tx={
    id:Date.now(), desc:'🎯 '+g.name,
    amt:capped, type:'goal', cat:'Savings Goal',
    date:new Date().toISOString().split('T')[0],
    split:null, goalId:id, goalName:g.name
  };

  saveTx(tx).then(function(res){
    if(res.error){ notify('// error saving: '+res.error.message); return; }
    data.tx.unshift(tx);
    playCoinSound();
    input.value='';
    notify('// '+fmt(capped)+' added to '+g.name+'!','ok');
    renderGoals();
    if(document.getElementById('panel-tx').style.display!=='none') renderTx();
  });
}

function renderGoals() {
  var balance=getCurrentBalance();
  var savBucket=getBucketRemaining('savings');
  var blocked=balance<=0||savBucket.alloc===0||savBucket.remaining<=0;
  var blockMsg=balance<=0
    ? '// locked: no balance - add income first'
    : '// locked: savings budget used up this period';

  var list=document.getElementById('goal-list');
  if(!data.goals.length){
    list.innerHTML='<div class="empty" style="background:var(--bg3);border:1px solid var(--border2);border-radius:2px">no_goals_found</div>';
    return;
  }

  list.innerHTML=data.goals.map(function(g){
    var saved=getGoalSaved(g.id);
    var pct=Math.min(100,Math.round((saved/g.target)*100));
    var done=saved>=g.target;
    var maxAmt=Math.min(savBucket.remaining, g.target-saved);
    var footer='';
    if(!done){
      footer=blocked
        ? '<div class="goal-locked">'+blockMsg+'</div>'
        : '<div class="contrib-row">'+
            '<input type="number" id="c-'+g.id+'" placeholder="max '+fmt(maxAmt)+'" min="0.01" step="0.01">'+
            '<button class="contrib-btn" onclick="contribute('+g.id+')">Add</button>'+
          '</div>'+
          '<div class="goal-info">// balance: '+fmt(balance)+' | savings left: '+fmt(savBucket.remaining)+'</div>';
    }
    return '<div class="goal-card">'+
      '<div class="goal-top">'+
        '<div style="min-width:0">'+
          '<div class="goal-name">'+g.name+'</div>'+
          '<div class="goal-amounts">'+fmt(saved)+' / '+fmt(g.target)+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">'+
          '<span class="pct-pill'+(done?' done':'')+'">'+( done?'complete':pct+'%')+'</span>'+
          '<button class="del" onclick="delGoal('+g.id+')" aria-label="Delete">&#x2715;</button>'+
        '</div>'+
      '</div>'+
      '<div class="bar-track"><div class="bar-fill'+(done?' done':'')+'" style="width:'+pct+'%"></div></div>'+
      '<div class="goal-meta"><span>'+fmt(g.target-saved)+' remaining</span><span>'+pct+'% complete</span></div>'+
      footer+
      '</div>';
  }).join('');
}


// CLEAR DATA

function clearData() {
  if(!clearPending){
    clearPending=true;
    var btn=document.querySelector('.clear-btn');
    btn.textContent='confirm? click again';
    btn.style.borderColor='var(--pink)';
    btn.style.color='var(--pink)';
    clearTimer=setTimeout(function(){
      clearPending=false;
      btn.innerHTML='&#x2715; clear data';
      btn.style.borderColor=''; btn.style.color='';
    },3000);
  } else {
    clearTimeout(clearTimer);
    clearPending=false;
    Promise.all([
      sb.from('transactions').delete().eq('user_id',currentUser.id),
      sb.from('goals').delete().eq('user_id',currentUser.id)
    ]).then(function(){
      data={ tx:[], goals:[] };
      renderTx(); renderPiggy();
      var btn=document.querySelector('.clear-btn');
      btn.innerHTML='&#x2715; clear data';
      btn.style.borderColor=''; btn.style.color='';
      notify('// all data cleared.','ok');
    });
  }
}


// CHA-CHING SOUND

function playCoinSound() {
  try {
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var t=ctx.currentTime;
    var cha=ctx.createOscillator(),chaGain=ctx.createGain(),chaFilter=ctx.createBiquadFilter();
    cha.connect(chaFilter);chaFilter.connect(chaGain);chaGain.connect(ctx.destination);
    cha.type='sawtooth';chaFilter.type='bandpass';chaFilter.frequency.value=400;chaFilter.Q.value=2;
    cha.frequency.setValueAtTime(220,t);cha.frequency.exponentialRampToValueAtTime(100,t+0.12);
    chaGain.gain.setValueAtTime(0.5,t);chaGain.gain.exponentialRampToValueAtTime(0.001,t+0.18);
    cha.start(t);cha.stop(t+0.2);
    var ching=ctx.createOscillator(),chingGain=ctx.createGain(),chingFilter=ctx.createBiquadFilter();
    ching.connect(chingFilter);chingFilter.connect(chingGain);chingGain.connect(ctx.destination);
    ching.type='triangle';chingFilter.type='highpass';chingFilter.frequency.value=2000;
    ching.frequency.setValueAtTime(3200,t+0.1);ching.frequency.exponentialRampToValueAtTime(1800,t+0.5);
    chingGain.gain.setValueAtTime(0,t+0.1);chingGain.gain.linearRampToValueAtTime(0.45,t+0.13);
    chingGain.gain.exponentialRampToValueAtTime(0.001,t+0.7);
    ching.start(t+0.1);ching.stop(t+0.75);
    var shimmer=ctx.createOscillator(),shimGain=ctx.createGain();
    shimmer.connect(shimGain);shimGain.connect(ctx.destination);shimmer.type='sine';
    shimmer.frequency.setValueAtTime(5400,t+0.1);shimmer.frequency.exponentialRampToValueAtTime(3200,t+0.6);
    shimGain.gain.setValueAtTime(0,t+0.1);shimGain.gain.linearRampToValueAtTime(0.2,t+0.14);
    shimGain.gain.exponentialRampToValueAtTime(0.001,t+0.65);
    shimmer.start(t+0.1);shimmer.stop(t+0.7);
  } catch(e){}
}

// - Start the app -
window.addEventListener('load', boot);
