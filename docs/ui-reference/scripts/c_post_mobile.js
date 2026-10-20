const L = require('./lib');
(async()=>{
 const b = await L.launch(); const c = await L.ctx(b,'mobile'); const p = await c.newPage();
 await L.login(p,'testcajero','testcajero');
 await L.shot(p,'cajero-home-cajaabierta-sidebaropen-mobile');
 await p.locator('section[data-testid="stSidebar"] button').first().click(); await L.settle(p,1200);
 await L.shot(p,'cajero-home-cajaabierta-sidebarcollapsed-mobile');
 await L.shot(p,'cajero-home-cajaabierta-sidebarcollapsed-mobile-viewport',false);
 for (const [path,name] of [['/mi-turno','turno-abierta'],['/mis-tickets','tickets'],['/nueva-venta','pos-carritovacio']]) {
   await L.go(p,path);
   // collapse sidebar if open
   const sb = p.locator('section[data-testid="stSidebar"]');
   if ((await sb.getAttribute('aria-expanded'))==='true') { await sb.locator('button').first().click(); await L.settle(p,1000); }
   await L.shot(p,`cajero-${name}-mobile`);
 }
 const adds = p.getByRole('button',{name:'Agregar', exact:true});
 await adds.nth(0).click(); await L.settle(p,1200); await adds.nth(1).click(); await L.settle(p,1200);
 await L.shot(p,'cajero-pos-carrito-mobile');
 await b.close();
})();
