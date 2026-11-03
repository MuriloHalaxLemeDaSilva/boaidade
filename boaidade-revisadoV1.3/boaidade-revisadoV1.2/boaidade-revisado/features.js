/* Funcionalidades adicionais persistidas pelo backend PHP/SQLite. */
(() => {
  let guideItems = [];
  let guideKind = 'all';

  window.header = function(active, family=false) {
    const links = family
      ? [['family','Visão geral'],['family-requests','Pedidos de ajuda'],['family-account','Vínculo familiar']]
      : [['portal','Início'],['form','Pedir ajuda'],['history','Meus pedidos'],['activities','Atividades'],['completed','Concluídas'],['guides','Guias'],['help','Ajuda'],['connect','Minha família']];
    return `<header class="portal-header"><div class="container-xl-custom d-flex justify-content-between align-items-center flex-wrap gap-3"><a href="#${family?'family':'portal'}" class="d-flex align-items-center gap-2 text-decoration-none">${logo()}${family?'<span class="family-role">Área da família</span>':''}</a><nav class="portal-nav d-flex gap-3 flex-wrap">${links.map(([id,label])=>`<a class="${id===active?'active':''}" href="#${id}">${esc(label)}</a>`).join('')}</nav><button class="btn btn-sm btn-outline-primary" onclick="logout()">Sair</button></div></header>`;
  };

  window.sendHelpRequest = async function(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api('requests',{method:'POST',body:JSON.stringify(values)});
      toast('Pedido enviado com sucesso. Você poderá acompanhar o andamento em Meus pedidos.');
      go('history');
    } catch (error) { fail(error); }
  };

  window.activityComplete = async function(id) {
    if (state.play?.completed) return;
    if (state.play && Number(state.play.id)===Number(id)) state.play.completed=true;
    try {
      await api('activity-complete',{method:'POST',body:JSON.stringify({activity_id:id})});
      toast('Parabéns! A atividade foi salva em Concluídas.');
    } catch(error) { if(state.play)state.play.completed=false; fail(error); }
  };

  window.portalPage = async function() {
    const [requestsData,usageData] = await Promise.all([api('requests'),api('usage-stats')]);
    const requests=requestsData.requests||[], usage=usageData.usage||{}, latest=requests[0];
    const statusClassLocal=s=>s==='Atendido'?'done':s==='Em análise'?'analysis':s==='Recusado'?'rejected':'pending';
    return portalShell('portal',`<div class="welcome mb-4"><p class="opacity-75 fs-5 mb-1">Bem-vindo(a),</p><h1 class="fw-black">${esc(state.user.name)}</h1><p class="opacity-75 mb-0">Sua área pessoal Conecta 60+</p></div>
      <div class="row g-3 mb-4"><div class="col-md-3"><div class="portal-stat bg-white"><span class="fs-2">📋</span><strong class="d-block">${requests.length}</strong><span class="text-secondary">Pedidos de ajuda</span></div></div><div class="col-md-3"><div class="portal-stat bg-white"><span class="fs-2">✅</span><strong class="d-block">${requests.filter(x=>x.status==='Atendido').length}</strong><span class="text-secondary">Pedidos atendidos</span></div></div><div class="col-md-3"><div class="portal-stat bg-white"><span class="fs-2">🔥</span><strong class="d-block">${usage.current_streak||0} ${Number(usage.current_streak)===1?'dia':'dias'}</strong><span class="text-secondary">Ofensiva de uso</span></div></div><div class="col-md-3"><div class="portal-stat bg-white"><span class="fs-2">📅</span><strong class="d-block">${usage.days_last_30||0}</strong><span class="text-secondary">Dias ativos · 30 dias</span></div></div></div>
      <div class="streak-callout mb-4"><span>🔥</span><div><strong>Sua ofensiva é de ${usage.current_streak||0} ${(usage.current_streak||0)===1?'dia':'dias'}!</strong><small>Entre na plataforma em dias consecutivos para manter sua sequência. Você já usou o site em ${usage.days_used||0} dia(s).</small></div></div>
      ${latest?`<div class="request-card mb-4"><div class="request-head d-flex justify-content-between align-items-center"><strong class="fs-5">📌 Pedido mais recente</strong><span class="status ${statusClassLocal(latest.status)}">${esc(latest.status)}</span></div><div class="p-4"><h2 class="h4 fw-bold">${esc(latest.category)}</h2><p class="text-secondary mb-0">${esc(latest.description)} · ${dateText(latest.created_at)}</p>${latest.updates?.length?`<div class="request-updates mt-3">${latest.updates.slice(-2).map(requestUpdateHtml).join('')}</div>`:''}</div></div>`:`<div class="feature-card mb-4"><h2 class="h5 fw-bold">Ainda não há pedidos</h2><p class="mb-0">Quando precisar, conte para nós como podemos ajudar.</p></div>`}
      <button class="btn-main w-100 py-3 fs-5" onclick="go('form')">➕ Pedir ajuda</button><div class="portal-shortcuts mt-4"><a class="portal-shortcut" href="#activities"><span>🧩</span><div><strong>Atividades</strong><small>Quebra-cabeças e caça-palavras</small></div><b>→</b></a><a class="portal-shortcut" href="#guides"><span>📘</span><div><strong>Guias de tecnologia</strong><small>Passos simples e vídeos</small></div><b>→</b></a></div>`);
  };

  function requestUpdateHtml(update) {
    return `<div class="request-update-item"><b>${esc(update.author_name)} · ${esc(update.status)}</b><small>${dateText(update.created_at)}</small>${update.message?`<p>${esc(update.message)}</p>`:''}</div>`;
  }

  window.activitiesPage = async function() {
    const [activitiesData,completedData]=await Promise.all([api('activities'),api('activity-completions')]);
    state.activities=activitiesData.activities||[];
    const completed=completedData.completions||[];
    return portalShell('activities',`<div class="feature-hero mb-4"><div><span class="eyebrow-light">Treine no seu ritmo</span><h1>Atividades para corpo e mente</h1><p class="mb-0">Faça uma atividade. Ao completar, ela fica salva na sua sessão de concluídos.</p></div><div class="feature-hero-icon">🧠</div></div>
      <div class="portal-feature-nav"><a class="active" href="#activities">🧩 Disponíveis (${state.activities.length})</a><a href="#completed">✅ Concluídas (${completed.length})</a><a href="#guides">📘 Guias</a></div><h2 class="fw-black mt-4 mb-3">Escolha uma atividade</h2>
      ${state.activities.length?`<div class="row g-4">${state.activities.map(a=>{const done=completed.some(c=>Number(c.activity_id)===Number(a.id));return `<div class="col-md-6 col-lg-4"><article class="activity-card">${a.type==='puzzle'?`<img class="activity-preview" src="${esc(a.image_path)}" alt="Imagem do quebra-cabeça">`:'<div class="activity-icon">🔤</div>'}<span class="activity-type">${a.type==='puzzle'?'Quebra-cabeça':'Caça-palavras'}</span>${done?'<span class="completed-badge">✓ Já concluída</span>':''}<h3>${esc(a.title)}</h3><p>${esc(a.description)}</p><button class="btn-main w-100 mt-3" onclick="go('play-${a.id}')">${done?'Fazer novamente':'Começar atividade'}</button></article></div>`}).join('')}</div>`:'<div class="feature-card">Ainda não há atividades publicadas. Volte mais tarde.</div>'}`);
  };

  window.completedPage = async function() {
    const result=await api('activity-completions'), items=result.completions||[];
    return portalShell('completed',`<div class="feature-hero mb-4"><div><span class="eyebrow-light">Suas conquistas</span><h1>Atividades concluídas</h1><p class="mb-0">Cada conclusão bem-sucedida fica registrada no seu histórico.</p></div><div class="feature-hero-icon">🏆</div></div><div class="portal-feature-nav"><a href="#activities">🧩 Disponíveis</a><a class="active" href="#completed">✅ Concluídas (${items.length})</a></div>${items.length?`<div class="row g-3 mt-2">${items.map(item=>`<div class="col-md-6"><article class="completed-item"><span>✓</span><div><strong>${esc(item.title)}</strong><small>${item.type==='puzzle'?'Quebra-cabeça':'Caça-palavras'} · concluída em ${dateText(item.completed_at)}</small></div><button class="btn btn-sm btn-outline-primary ms-auto" onclick="go('play-${item.activity_id}')">Refazer</button></article></div>`).join('')}</div>`:'<div class="feature-card mt-3"><h2 class="h5 fw-bold">Sua lista ainda está vazia</h2><p>Quando terminar uma atividade com sucesso, ela aparecerá aqui.</p><a href="#activities" class="btn-main d-inline-block text-decoration-none">Ver atividades</a></div>'}`);
  };

  window.guidesPage = async function() {
    const result=await api('guides');guideItems=result.guides||[];guideKind='all';
    return portalShell('guides',`<div class="feature-hero mb-4"><div><span class="eyebrow-light">Aprenda com calma</span><h1>Guias de tecnologia</h1><p class="mb-0">Passo a passos e vídeos publicados pela equipe. Pesquise um tema ou escolha uma categoria.</p></div><div class="feature-hero-icon">📘</div></div>
      <div class="guide-search-panel"><label class="fw-bold" for="guideSearch">Pesquisar guias</label><input id="guideSearch" class="form-control mt-2" type="search" placeholder="Ex.: WhatsApp, letras, segurança" oninput="filterGuides()"><div class="guide-filter-row"><button class="guide-filter active" data-kind="all" onclick="setGuideKind('all',this)">Todos</button><button class="guide-filter" data-kind="step" onclick="setGuideKind('step',this)">Passo a passo</button><button class="guide-filter" data-kind="video" onclick="setGuideKind('video',this)">Vídeos</button></div></div>
      <div id="guideResults" class="row g-3 mt-2"></div><div id="guideEmpty" class="feature-card mt-3 d-none"></div>`);
  };
  window.setGuideKind=function(kind,button){guideKind=kind;document.querySelectorAll('.guide-filter').forEach(x=>x.classList.remove('active'));button?.classList.add('active');filterGuides();};
  window.filterGuides=function(){
    const q=(document.getElementById('guideSearch')?.value||'').toLocaleLowerCase('pt-BR');
    const matches=guideItems.filter(g=>(guideKind==='all'||g.type===guideKind)&&`${g.title} ${g.category} ${g.summary} ${g.content}`.toLocaleLowerCase('pt-BR').includes(q));
    const target=document.getElementById('guideResults'),empty=document.getElementById('guideEmpty');if(!target)return;
    target.innerHTML=matches.map(g=>`<div class="col-md-6 col-lg-4"><article class="guide-card h-100"><span class="guide-category">${esc(g.category)}</span><h2 class="h5 fw-bold mt-2">${esc(g.title)}</h2><p>${esc(g.summary)}</p>${g.type==='step'?`<details class="guide-steps"><summary>Ver passo a passo</summary><ol>${g.content.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>`<li>${esc(x.replace(/^\d+[.)]\s*/,''))}</li>`).join('')}</ol></details>`:`<video class="guide-video" controls preload="metadata" playsinline src="${esc(g.video_path)}">Seu navegador não consegue reproduzir este vídeo.</video>${g.content?`<details class="guide-steps mt-2"><summary>Instruções do vídeo</summary><p>${esc(g.content)}</p></details>`:''}`}</article></div>`).join('');
    if(empty){empty.classList.toggle('d-none',matches.length>0);if(!guideItems.length)empty.textContent='Ainda não há guias publicados. A equipe poderá adicioná-los em breve.';else empty.textContent='Nenhum guia corresponde à pesquisa. Tente outra palavra.';}
  };

  window.familyPage = async function() {
    const [requestsData,statsData]=await Promise.all([api('requests'),api('family-stats')]);
    const requests=requestsData.requests||[], stats=statsData.usage||{}, elder=statsData.elder||{}, latest=requests[0];
    return portalShell('family',`<div class="feature-hero family-hero mb-4"><div><span class="eyebrow-light">Acompanhamento seguro</span><h1>Área da família</h1><p class="mb-0">Acompanhe pedidos e frequência de uso de ${esc(elder.name||'seu familiar')}.</p></div><div class="feature-hero-icon">💙</div></div>
      ${latest&&latest.status==='Pendente'?`<div class="family-alert mb-3"><span>🔔</span><div><strong>Há um pedido aguardando análise</strong><p class="mb-0">${esc(latest.category)} · ${esc(latest.description)}</p></div><a class="btn btn-sm btn-primary ms-auto" href="#family-requests">Analisar</a></div>`:''}
      <h2 class="h4 fw-bold mb-3">Frequência de uso · ${esc(elder.name||'Idoso vinculado')}</h2><div class="row g-3 mb-4"><div class="col-md-3"><div class="usage-stat"><strong>${stats.days_last_30||0}</strong><span>dias ativos nos últimos 30</span></div></div><div class="col-md-3"><div class="usage-stat"><strong>${stats.current_streak||0}</strong><span>dias de ofensiva atual</span></div></div><div class="col-md-3"><div class="usage-stat"><strong>${stats.days_used||0}</strong><span>dias de uso registrados</span></div></div><div class="col-md-3"><div class="usage-stat"><strong>${statsData.completed_activities||0}</strong><span>atividades concluídas</span></div></div></div>
      <div class="feature-card mb-4"><h2 class="h4 fw-bold">Ajudar a recuperar a senha</h2><p>Gere um código temporário e compartilhe diretamente com o idoso. Ele usará o código na opção “Esqueci minha senha” e escolherá uma nova senha. Você não verá nem definirá a senha.</p><button class="btn-main" onclick="generateFamilyRecoveryCode()">Gerar código de recuperação</button><div id="familyRecoveryResult" class="mt-3" aria-live="polite"></div></div>
      <div class="feature-card mb-4"><strong>Último acesso</strong><p class="mb-0">${stats.last_seen_at?dateText(stats.last_seen_at):'Ainda não há acessos registrados.'}</p><small class="text-secondary">A frequência conta dias distintos em que a conta do idoso foi utilizada, sem registrar conteúdo pessoal além dos pedidos e das atividades.</small></div>
      <div class="feature-card"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2"><h2 class="h4 fw-bold mb-0">Pedidos de ajuda</h2><a href="#family-requests" class="btn-outline-main">Ver e analisar pedidos</a></div><p class="text-secondary mt-2 mb-0">${requests.length?`${requests.length} pedido(s); o mais recente: ${esc(latest.category)} — ${esc(latest.status)}.`:'Nenhum pedido recebido até o momento.'}</p></div>`,true);
  };

  window.familyRequestsPage = async function() {
    const data=await api('requests'),requests=data.requests||[];
    return portalShell('family-requests',`<div class="feature-hero family-hero mb-4"><div><span class="eyebrow-light">Área da família</span><h1>Pedidos de ajuda</h1><p class="mb-0">Analise, acompanhe e deixe uma orientação para o idoso vinculado.</p></div><div class="feature-hero-icon">📋</div></div>
      ${requests.length?requests.map(r=>`<article class="request-card mb-3"><div class="p-4"><div class="d-flex justify-content-between flex-wrap gap-2"><div><small class="text-secondary">${dateText(r.created_at)} · ${esc(r.user_name)}</small><h2 class="h4 fw-bold mt-2">${esc(r.category)}</h2></div><span class="status ${statusClassFor(r.status)}">${esc(r.status)}</span></div><p class="mb-3">${esc(r.description)}</p>${r.updates?.length?`<div class="request-updates mb-3">${r.updates.map(requestUpdateHtml).join('')}</div>`:''}<div class="family-analysis-form"><label class="fw-bold" for="family-status-${r.id}">Sua análise</label><select id="family-status-${r.id}" class="form-select my-2"><option value="Em análise" ${r.status==='Em análise'?'selected':''}>Em análise — vou acompanhar</option><option value="Atendido" ${r.status==='Atendido'?'selected':''}>Atendido — resolvido com meu familiar</option></select><textarea id="family-message-${r.id}" maxlength="1000" class="form-control" rows="2" placeholder="Escreva uma orientação ou observação para o idoso"></textarea><button class="btn btn-primary mt-2" onclick="saveFamilyRequest(${r.id})">Salvar análise</button></div></div></article>`).join(''):'<div class="feature-card">Ainda não há pedidos do idoso vinculado.</div>'}` ,true);
  };

  window.generateFamilyRecoveryCode=async function(){
    const target=document.getElementById('familyRecoveryResult');
    try{
      const data=await api('family-recovery-code',{method:'POST',body:'{}'});
      target.innerHTML=`<div class="invite-code recovery-code"><small>Código de recuperação · válido por 30 minutos · uso único</small><strong>${esc(data.code)}</strong><button type="button" class="btn btn-sm btn-outline-primary" onclick="navigator.clipboard.writeText('${esc(data.code)}').then(()=>toast('Código copiado. Compartilhe diretamente com o idoso.')).catch(()=>toast('Selecione e copie o código manualmente.'))">Copiar código</button></div><p class="small text-secondary mt-2 mb-0">Ao gerar outro código, este será invalidado. Compartilhe em particular e não envie em grupos públicos.</p>`;
    }catch(error){fail(error);}
  };
  window.saveFamilyRequest=async function(id){
    const status=document.getElementById(`family-status-${id}`).value,message=document.getElementById(`family-message-${id}`).value.trim();
    if(!message){toast('Escreva uma observação breve para registrar sua análise.');document.getElementById(`family-message-${id}`).focus();return;}
    try{await api('family-request-update',{method:'POST',body:JSON.stringify({id,status,message})});toast('Sua análise foi salva e ficará visível para o idoso.');await render();}catch(error){fail(error);}
  };

  function statusClassFor(status){return status==='Atendido'?'done':status==='Em análise'?'analysis':status==='Recusado'?'rejected':'pending';}
  window.statusClass = statusClassFor;

  function userDashboardCharts(users=[]) {
    const roles=[
      {key:'elderly',label:'Idosos',color:'elderly'},
      {key:'family',label:'Familiares',color:'family'}
    ].map(role=>({...role,count:users.filter(user=>user.role===role.key).length}));
    const roleMax=Math.max(1,...roles.map(role=>role.count));
    const now=new Date();
    const months=Array.from({length:6},(_,index)=>{
      const date=new Date(now.getFullYear(),now.getMonth()-5+index,1);
      return {key:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`,label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(date).replace('.',''),count:0};
    });
    const monthIndex=new Map(months.map((month,index)=>[month.key,index]));
    users.forEach(user=>{
      const match=String(user.created_at||'').match(/^(\d{4})-(\d{2})/);
      const index=match?monthIndex.get(`${match[1]}-${match[2]}`):undefined;
      if(index!==undefined)months[index].count++;
    });
    const monthMax=Math.max(1,...months.map(month=>month.count));
    const total=roles.reduce((sum,role)=>sum+role.count,0);
    return `<div class="admin-chart-grid">
      <section class="admin-chart-card" aria-labelledby="user-profile-chart-title">
        <div class="admin-chart-heading"><div><h2 id="user-profile-chart-title">Usuários por perfil</h2><p>Distribuição das contas cadastradas</p></div><span class="chart-total">${total} no total</span></div>
        <div class="role-chart" role="img" aria-label="${roles.map(role=>`${role.label}: ${role.count}`).join('; ')}">${roles.map(role=>`<div class="role-chart-row"><div class="role-chart-label"><span>${role.label}</span><strong>${role.count}</strong></div><div class="role-chart-track"><span class="${role.color}" style="width:${total?Math.max(role.count/roleMax*100,role.count?4:0):0}%"></span></div></div>`).join('')}</div>
        <div class="chart-footnote">Contas administrativas não estão incluídas.</div>
      </section>
      <section class="admin-chart-card" aria-labelledby="user-growth-chart-title">
        <div class="admin-chart-heading"><div><h2 id="user-growth-chart-title">Novos cadastros</h2><p>Entradas por mês · últimos 6 meses</p></div><span class="chart-total">${months.reduce((sum,month)=>sum+month.count,0)} recentes</span></div>
        <div class="signup-chart" role="img" aria-label="${months.map(month=>`${month.label}: ${month.count} cadastros`).join('; ')}">${months.map(month=>`<div class="signup-chart-column"><span class="signup-value">${month.count}</span><div class="signup-track"><span style="height:${month.count?Math.max(month.count/monthMax*100,5):0}%"></span></div><small>${month.label}</small></div>`).join('')}</div>
      </section>
    </div>`;
  }

  window.historyPage = async function() {
    const data=await api('requests'),requests=data.requests||[];
    return portalShell('history',`<h1 class="fw-black mb-4">Meus pedidos de ajuda</h1>${requests.length?requests.map(r=>`<article class="request-card mb-3"><div class="p-4"><div class="d-flex justify-content-between flex-wrap gap-2"><div><small class="text-secondary">PED-${String(r.id).padStart(4,'0')} · ${dateText(r.created_at)}</small><h2 class="h4 fw-bold mt-2">${esc(r.category)}</h2></div><span class="status ${statusClassFor(r.status)}">${esc(r.status)}</span></div><p>${esc(r.description)}</p>${r.response?`<div class="alert alert-info"><b>Resposta da equipe:</b> ${esc(r.response)}</div>`:''}${r.updates?.length?`<div class="request-updates">${r.updates.map(requestUpdateHtml).join('')}</div>`:''}</div></article>`).join(''):`<div class="feature-card">Nenhum pedido enviado ainda. <button class="btn-main mt-3" onclick="go('form')">Pedir ajuda</button></div>`}`);
  };

  window.adminPage = async function() {
    try{state.admin=await api('admin-data');}catch(error){fail(error);}
    return `<div class="admin-shell"><aside class="admin-sidebar"><div class="admin-logo"><div class="logo-mark">60+</div><div><strong>Conecta 60+</strong><small class="d-block">Área administrativa</small></div></div><nav class="admin-nav mt-3"><button data-admin-tab="dashboard" class="active" onclick="adminTab('dashboard')">▦ <span class="label">Resumo</span></button><button data-admin-tab="requests" onclick="adminTab('requests')">✓ <span class="label">Pedidos</span></button><button data-admin-tab="users" onclick="adminTab('users')">♙ <span class="label">Usuários</span></button><button data-admin-tab="activities" onclick="adminTab('activities')">🧩 <span class="label">Atividades</span></button><button data-admin-tab="guides" onclick="adminTab('guides')">📘 <span class="label">Guias e vídeos</span></button></nav></aside><section class="admin-content"><header class="admin-topbar d-flex justify-content-between align-items-center"><div><h1 id="adminTitle" class="h5 fw-bold mb-1">Administração</h1><small class="text-secondary">Sessão protegida · ${esc(state.user.name)}</small></div><button class="btn btn-sm btn-outline-secondary" onclick="logout()">Sair</button></header><main id="adminMain" class="admin-main"></main></section></div>`;
  };

  window.adminTab = async function(tab) {
    const main=document.getElementById('adminMain');if(!main)return;
    document.querySelectorAll('[data-admin-tab]').forEach(x=>x.classList.toggle('active',x.dataset.adminTab===tab));
    const names={dashboard:'Resumo',requests:'Pedidos de ajuda',users:'Contas cadastradas',activities:'Gestão de atividades',guides:'Guias e vídeos'};
    document.getElementById('adminTitle').textContent=names[tab]||'Administração';
    try{
      const d=await api('admin-data');state.admin=d;guideItems=d.guides||[];
      if(tab==='dashboard'){
        const metrics=[['Contas',d.counts.users,'♙','Idosos e familiares'],['Idosos',d.counts.elderly,'♡','Aprendendo com autonomia'],['Familiares',d.counts.families,'⌂','Conectados à plataforma'],['Pedidos',d.counts.requests,'✓','Solicitações recebidas']];
        main.innerHTML=`<section class="admin-welcome"><div><span class="admin-eyebrow">PAINEL DE CONTROLE</span><h2>Visão geral da comunidade</h2><p>Acompanhe quem está chegando e como os perfis se distribuem.</p></div><div class="welcome-mark" aria-hidden="true">60+</div></section><div class="row g-3 admin-metrics">${metrics.map(([label,value,icon,detail])=>`<div class="col-6 col-xl-3"><article class="dash-card"><div class="dash-card-top"><small>${label}</small><span class="dash-icon" aria-hidden="true">${icon}</span></div><div class="dash-kpi">${Number(value)||0}</div><span class="dash-caption">${detail}</span></article></div>`).join('')}</div>${userDashboardCharts(d.users||[])}<section class="table-card admin-content-summary"><div><span class="admin-eyebrow">CONTEÚDO DA PLATAFORMA</span><h2>Materiais publicados</h2><p>${d.activities.length} atividade(s) · ${d.guides.length} guia(s) ou vídeo(s).</p></div><button class="btn-main" onclick="adminTab('guides')">Gerenciar conteúdos</button></section>`;
      } else if(tab==='activities') {
        main.innerHTML=`<div class="table-card"><div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3"><div><h2 class="h5 fw-bold">Atividades</h2><small>Quebra-cabeças e caça-palavras publicados.</small></div><button class="btn-main" onclick="activityForm()">＋ Nova atividade</button></div><div class="row g-3">${d.activities.map(a=>`<div class="col-md-6"><div class="admin-content-card"><span class="admin-badge b-aprovado">${a.type==='puzzle'?'Quebra-cabeça':'Caça-palavras'}</span><h3 class="h5 fw-bold mt-2">${esc(a.title)}</h3><p>${esc(a.description)}</p>${a.image_path?`<img class="admin-activity-preview" src="${esc(a.image_path)}" alt="Imagem da atividade">`:''}<button class="btn btn-sm btn-outline-primary" onclick="activityForm(${a.id})">Editar</button> <button class="btn btn-sm btn-outline-danger" onclick="deleteActivity(${a.id},'${esc(a.title)}')">Excluir</button></div></div>`).join('')||'<p>Nenhuma atividade cadastrada.</p>'}</div></div>`;
      } else if(tab==='guides') {
        main.innerHTML=`<div class="table-card"><div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3"><div><h2 class="h5 fw-bold">Guias passo a passo e vídeos</h2><small>Adicione, edite ou exclua conteúdos vistos pelos idosos.</small></div><button class="btn-main" onclick="guideForm()">＋ Novo guia ou vídeo</button></div><div class="row g-3">${d.guides.map(g=>`<div class="col-md-6"><article class="admin-content-card"><span class="admin-badge b-aprovado">${g.type==='step'?'Passo a passo':'Vídeo'} · ${esc(g.category)}</span><h3 class="h5 fw-bold mt-2">${esc(g.title)}</h3><p>${esc(g.summary)}</p>${g.type==='video'?`<video class="admin-guide-video" controls preload="metadata" src="${esc(g.video_path)}"></video>`:`<details><summary>Pré-visualizar passos</summary><ol>${g.content.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(s=>`<li>${esc(s.replace(/^\d+[.)]\s*/,''))}</li>`).join('')}</ol></details>`}<button class="btn btn-sm btn-outline-primary mt-2" onclick="guideForm(${g.id})">Editar</button> <button class="btn btn-sm btn-outline-danger mt-2" onclick="deleteGuide(${g.id},'${esc(g.title)}')">Excluir</button></article></div>`).join('')||'<div class="col-12"><p>Nenhum guia publicado.</p></div>'}</div></div>`;
      } else if(tab==='requests') {
        const requests=(await api('requests')).requests||[];
        main.innerHTML=`<div class="table-card"><h2 class="h5 fw-bold">Pedidos recebidos</h2><p>Atualize o status, recuse com justificativa ou responda ao idoso.</p>${requests.length?`<div class="row g-3">${requests.map(r=>`<div class="col-12"><article class="admin-request-card"><div class="d-flex justify-content-between flex-wrap gap-2"><div><small>${esc(r.user_name)} · ${dateText(r.created_at)}</small><h3 class="h5 fw-bold mt-1">${esc(r.category)}</h3></div><span class="status ${statusClassFor(r.status)}">${esc(r.status)}</span></div><p>${esc(r.description)}</p>${r.updates?.length?`<div class="request-updates mb-3">${r.updates.map(requestUpdateHtml).join('')}</div>`:''}<div class="row g-2 align-items-end"><div class="col-md-3"><label class="fw-bold">Status</label><select id="status-${r.id}" class="form-select"><option ${r.status==='Pendente'?'selected':''}>Pendente</option><option ${r.status==='Em análise'?'selected':''}>Em análise</option><option ${r.status==='Atendido'?'selected':''}>Atendido</option><option ${r.status==='Recusado'?'selected':''}>Recusado</option></select></div><div class="col-md-7"><label class="fw-bold">Resposta ou motivo da recusa</label><textarea id="response-${r.id}" maxlength="1000" class="form-control" rows="2" placeholder="Escreva uma orientação clara para o idoso">${esc(r.response||'')}</textarea></div><div class="col-md-2"><button class="btn btn-primary w-100" onclick="saveRequest(${r.id})">Salvar</button></div></div></article></div>`).join('')}</div>`:'<p>Nenhum pedido recebido.</p>'}</div>`;
      } else {
        main.innerHTML=`<div class="table-card"><h2 class="h5 fw-bold">Contas cadastradas</h2><p>Contas de idosos e familiares separadas por perfil.</p><div class="table-responsive"><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Criada em</th></tr></thead><tbody>${d.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${roleName(u.role)}</td><td>${dateText(u.created_at)}</td></tr>`).join('')||'<tr><td colspan="4">Nenhuma conta cadastrada.</td></tr>'}</tbody></table></div></div>`;
      }
    }catch(error){fail(error);}
  };

  window.saveRequest = async function(id) {
    const status=document.getElementById(`status-${id}`).value,response=document.getElementById(`response-${id}`).value.trim();
    if(status==='Recusado'&&!response){toast('Informe o motivo antes de recusar o pedido.');return;}
    try{await api('request-update',{method:'POST',body:JSON.stringify({id,status,response})});toast('Status e resposta salvos.');await adminTab('requests');}catch(error){fail(error);}
  };

  window.guideForm=function(id=0){
    const guide=state.admin?.guides?.find(g=>Number(g.id)===Number(id));
    document.getElementById('adminMain').innerHTML=`<div class="table-card"><button class="btn btn-light border mb-3" onclick="adminTab('guides')">← Voltar aos guias</button><h2 class="h4 fw-bold">${guide?'Editar':'Adicionar'} guia ou vídeo</h2><form id="guideForm" onsubmit="saveGuide(event)"><input type="hidden" name="id" value="${guide?.id||''}"><label class="fw-bold mt-3">Formato</label><select class="form-select" name="type" onchange="toggleGuideFields(this.value)"><option value="step" ${guide?.type==='step'?'selected':''}>Passo a passo</option><option value="video" ${guide?.type==='video'?'selected':''}>Vídeo enviado</option></select><label class="fw-bold mt-3">Título</label><input required maxlength="120" class="form-control" name="title" value="${esc(guide?.title||'')}"><label class="fw-bold mt-3">Categoria</label><input required maxlength="60" class="form-control" name="category" value="${esc(guide?.category||'')}"><label class="fw-bold mt-3">Resumo</label><textarea required maxlength="500" class="form-control" name="summary" rows="2">${esc(guide?.summary||'')}</textarea><div id="guideContentField"><label class="fw-bold mt-3">Passos ou instruções (um passo por linha)</label><textarea class="form-control" name="content" rows="8" placeholder="1. Abra o aplicativo...">${esc(guide?.content||'')}</textarea></div><div id="guideVideoField" class="${guide?.type==='video'?'':'d-none'}"><label class="fw-bold mt-3">Arquivo de vídeo MP4 ou WEBM · até 50 MB</label><input class="form-control" type="file" name="video" accept="video/mp4,video/webm">${guide?.video_path?'<small>Envie um arquivo novo somente para substituir o atual.</small>':''}</div><button class="btn-main mt-4">Salvar publicação</button></form></div>`;
    toggleGuideFields(guide?.type||'step');
  };
  window.toggleGuideFields=function(type){document.getElementById('guideContentField')?.classList.toggle('d-none',type==='video');document.getElementById('guideVideoField')?.classList.toggle('d-none',type!=='video');};
  window.saveGuide=async function(event){event.preventDefault();try{await api('guide-save',{method:'POST',body:new FormData(event.currentTarget)});toast('Guia publicado com sucesso.');await adminTab('guides');}catch(error){fail(error);}};
  window.deleteGuide=async function(id,title){if(!confirm(`Excluir “${title}”? O vídeo enviado também será removido.`))return;try{await api('guide-delete',{method:'DELETE',query:`&id=${id}`});toast('Guia excluído.');await adminTab('guides');}catch(error){fail(error);}};

  window.render = async function() {
    const raw=location.hash.slice(1)||'landing';
    if(['login','register','forgot','tutorial'].includes(raw)){app.innerHTML=authPage(raw==='tutorial'?'tutorial':raw);return;}
    if(['landing','sobre','como-funciona'].includes(raw)){landing();if(raw!=='landing')setTimeout(()=>document.getElementById(raw)?.scrollIntoView(),0);return;}
    if(!state.user){go('login');toast('Entre ou crie uma conta para continuar.');return;}
    const role=state.user.role;
    if(raw==='admin'&&role!=='admin'){go(role==='family'?'family':'portal');return;}
    if(raw.startsWith('family')&&role!=='family'){go(role==='admin'?'admin':'portal');return;}
    const elderRoutes=['portal','form','history','activities','completed','guides','help','connect'];
    if((elderRoutes.includes(raw)||raw.startsWith('play-'))&&role!=='elderly'){go(role==='admin'?'admin':'family');return;}
    try{
      let html='';
      if(raw==='portal')html=await portalPage();else if(raw==='form')html=await formPage();else if(raw==='history')html=await historyPage();else if(raw==='connect')html=await connectPage();else if(raw==='family')html=await familyPage();else if(raw==='family-requests')html=await familyRequestsPage();else if(raw==='family-account')html=await familyAccountPage();else if(raw==='activities')html=await activitiesPage();else if(raw==='completed')html=await completedPage();else if(raw==='guides')html=await guidesPage();else if(raw==='help')html=await helpPage();else if(raw.startsWith('play-'))html=await playPage(raw.slice(5));else if(raw==='admin')html=await adminPage();else html='<div class="feature-card">Página não encontrada.</div>';
      app.innerHTML=html;if(raw==='admin')await adminTab('dashboard');if(raw==='guides')filterGuides();
    }catch(error){console.error(error);app.innerHTML=`<div class="feature-card m-5">Não foi possível carregar esta página. <button class="btn-main" onclick="render()">Tentar novamente</button></div>`;}
  };
  window.addEventListener('hashchange', window.render);
})();
