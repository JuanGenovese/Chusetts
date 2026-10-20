const L = require('./lib'); const fs=require('fs');
const PROPS=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','color','backgroundColor','backgroundImage','borderTop','borderRadius','boxShadow','padding','margin','width','maxWidth','height','minHeight','display','gap','textAlign','opacity'];
const SEL = {
 body:'body', app:'.stApp', main:'[data-testid="stMain"]', blockContainer:'.block-container', sidebar:'section[data-testid="stSidebar"]',
 sidebarTitle:'section[data-testid="stSidebar"] h1', sidebarCaption:'section[data-testid="stSidebar"] [data-testid="stCaptionContainer"]', menuLabel:'.sidebar-menu-label',
 navActive:'[class*="st-key-sidebar_nav_active_"] button', nav:'[class*="st-key-sidebar_nav_"]:not([class*="active"]) button', logout:'[class*="st-key-sidebar_logout"] button', sidebarNote:'.sidebar-note',
 banner:'.test-env-banner', bannerBadge:'.test-env-badge', bannerTitle:'.test-env-title',
 brandShell:'.brand-shell', brandTitle:'.brand-title', brandTagline:'.brand-tagline', pinta:'.brand-tagline .pinta', brandText:'.brand-text',
 pageCard:'.page-card', pageCardH2:'.page-card h2', pageCardP:'.page-card p', kpiCard:'.kpi-card', kpiLabel:'.kpi-label', kpiValue:'.kpi-value', kpiHelp:'.kpi-help',
 quickAction:'[class*="st-key-quick_action"] button', h3:'h3', h2:'h2',
 productCard:'.product-card', productName:'.product-name', productMeta:'.product-meta', productStock:'.product-stock', productPrice:'.product-price',
 cartHeader:'.cart-header-compact', cartTitle:'.cart-header-title', cartItem:'[class*="st-key-cart_item_"]', cartName:'.cart-product-name', cartMeta:'.cart-product-meta', cartSub:'.cart-subtotal-value', cartQty:'.cart-qty-display', cartTotal:'.cart-total-box', quickBanner:'.quick-banner',
 btn:'.stButton > button', btnP:'[data-testid="stBaseButton-primary"]', btnSecondary:'[data-testid="stBaseButton-secondary"]', formSubmit:'[data-testid="stFormSubmitButton"] > button',
 input:'div[data-baseweb="base-input"]', inputEl:'input[type="text"]', textarea:'textarea', select:'div[data-baseweb="select"] > div', label:'[data-testid="stWidgetLabel"] p', numberBtn:'div[data-testid="stNumberInput"] button',
 metric:'div[data-testid="stMetric"]', metricLabel:'[data-testid="stMetricLabel"]', metricValue:'[data-testid="stMetricValue"]',
 alert:'[data-testid="stAlert"]', form:'div[data-testid="stForm"]', container:'[data-testid="stVerticalBlockBorderWrapper"]',
 tab:'button[role="tab"]', tabActive:'button[role="tab"][aria-selected="true"]', tabList:'[role="tablist"]', expander:'[data-testid="stExpander"]',
 radio:'[data-testid="stRadio"] label', checkbox:'[data-testid="stCheckbox"] label', caption:'[data-testid="stCaptionContainer"]',
 lightTable:'.light-table', lightTh:'.light-table thead th', lightTd:'.light-table tbody td', emptyTickets:'.empty-tickets-box', softNote:'.soft-note',
 summaryHeader:'.admin-summary-header', summaryCard:'.admin-summary-card', summaryRow:'.admin-summary-row', summaryTotal:'.admin-summary-total', panelTitle:'.admin-panel-title',
 dialog:'[data-testid="stDialog"] [role="dialog"]', segmented:'[data-testid="stButtonGroup"] button',
 loginWrap:'.login-wrap', loginBrand:'.login-brand', loginPill:'.login-pill', loginTitle:'.login-title', loginTagline:'.login-tagline', loginText:'.login-text',
 loginPanel:'div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-panel-anchor)', loginInput:'[class*="st-key-login_panel"] div[data-baseweb="input"]', loginBtn:'[class*="st-key-login_button"] button',
 toast:'[data-testid="stToast"]', header:'header[data-testid="stHeader"]',
};
async function grab(p){
  return p.evaluate(({SEL,PROPS})=>{ const out={}; for(const [k,s] of Object.entries(SEL)){ let el=null; try{el=document.querySelector(s);}catch(e){} if(!el) continue; const cs=getComputedStyle(el); const o={}; for(const pr of PROPS) o[pr]=cs[pr]; const r=el.getBoundingClientRect(); o._rect=[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]; out[k]=o;} return out;},{SEL,PROPS});
}
(async()=>{
 const b=await L.launch(); const res={};
 let c=await L.ctx(b,'desktop'); let p=await c.newPage();
 await p.goto(L.BASE+'/',{waitUntil:'networkidle'}); await L.settle(p,2000); res.login=await grab(p); await c.close();
 c=await L.ctx(b,'desktop'); p=await c.newPage(); await L.login(p,'testcajero','testcajero');
 res.cashHome=await grab(p);
await L.go(p,'/mi-turno'); await L.btn(p,'Abrir caja').click(); await L.settle(p,2500); await L.go(p,'/nueva-venta'); await p.getByRole('button',{name:'Agregar',exact:true}).first().click().catch(()=>{}); await L.settle(p,1500); res.pos=await grab(p);
 // hover/focus states
 const hov={};
 const bt=p.getByRole('button',{name:'Agregar',exact:true}).first(); await bt.hover(); await p.waitForTimeout(400);
 hov.btnHover=await bt.evaluate(e=>{const c=getComputedStyle(e);return {bg:c.backgroundColor,color:c.color,shadow:c.boxShadow,transform:c.transform}});
 const sel=p.locator('[data-testid="stSelectbox"] div[data-baseweb="select"]').first(); await sel.click(); await p.waitForTimeout(500);
 hov.selectOpenPopover=await p.evaluate(()=>{const e=document.querySelector('ul[role="listbox"]'); if(!e) return null; const c=getComputedStyle(e); const li=e.querySelector('li'); const lc=li?getComputedStyle(li):null; return {bg:c.backgroundColor,border:c.border,radius:c.borderRadius,shadow:c.boxShadow, optFont:lc&&lc.fontSize, optPad:lc&&lc.padding}});
 await p.keyboard.press('Escape');
 res.hover=hov;
 // cart qty buttons
 res.cartButtons=await p.evaluate(()=>[...document.querySelectorAll('[class*="st-key-cart_item_"] button')].slice(0,4).map(b=>{const c=getComputedStyle(b);const r=b.getBoundingClientRect();return {text:b.innerText,bg:c.backgroundColor,color:c.color,w:r.width,h:r.height,font:c.fontSize, vis:c.visibility, op:c.opacity, html:b.outerHTML.slice(0,160)}}));
 await c.close();
 c=await L.ctx(b,'desktop'); p=await c.newPage(); await L.login(p,'testadmin','testadmin');
 res.adminHome=await grab(p);
 await L.go(p,'/productos'); res.productos=await grab(p);
 await p.getByRole('button',{name:'＋ Nuevo producto'}).click().catch(()=>{}); await L.settle(p,1500); res.dialog=await grab(p);
 await p.keyboard.press('Escape'); await L.go(p,'/carga-rapida'); res.cargaRapida=await grab(p);
 await L.go(p,'/movimientos'); res.movimientos=await grab(p);
 // layout widths
 res.layout=await p.evaluate(()=>({innerWidth:innerWidth, sidebarWidth:document.querySelector('section[data-testid="stSidebar"]').getBoundingClientRect().width, mainBlock:document.querySelector('.block-container').getBoundingClientRect().toJSON(), fonts:[...document.fonts].map(f=>f.family+' '+f.weight+' '+f.status).slice(0,20)}));
 // focus input
 const inp=p.locator('input[type="text"]').first(); 
 await L.go(p,'/productos'); const sr=p.getByLabel('Buscar'); await sr.focus(); res.inputFocus=await p.evaluate(()=>{const e=document.activeElement.closest('div[data-baseweb="base-input"]')||document.activeElement; const c=getComputedStyle(e); return {border:c.border,shadow:c.boxShadow,bg:c.backgroundColor,outline:c.outline,radius:c.borderRadius}});
 fs.writeFileSync('styles.json',JSON.stringify(res,null,1)); await b.close();
})();
