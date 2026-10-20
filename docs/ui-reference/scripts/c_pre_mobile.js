const L = require('./lib');
(async()=>{
 const b = await L.launch(); const c = await L.ctx(b,'mobile'); const p = await c.newPage();
 await L.login(p,'testcajero','testcajero');
 await L.shot(p,'cajero-home-cajacerrada-mobile');
 // sidebar expanded on mobile
 const ex = p.locator('[data-testid="stExpandSidebarButton"]');
 if (await ex.count()) { await ex.first().click(); await L.settle(p,1200); await L.shot(p,'cajero-sidebar-expanded-mobile', false); }
 await L.go(p,'/mi-turno');
 await L.shot(p,'cajero-turno-cerrada-mobile');
 await L.go(p,'/nueva-venta');
 await L.shot(p,'cajero-pos-sinturno-mobile');
 await b.close();
})();
