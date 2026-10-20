const L = require('./lib');
(async()=>{
 const b = await L.launch(); const c = await L.ctx(b,'desktop'); const p = await c.newPage();
 await L.login(p,'testcajero','testcajero');
 // sidebar collapsed
 await p.locator('section[data-testid="stSidebar"] button').first().click().catch(()=>{});
 await L.settle(p,1200); await L.shot(p,'cajero-home-sidebarcollapsed-desktop');
 await p.locator('[data-testid="stExpandSidebarButton"]').first().click().catch(()=>{}); await L.settle(p,1000);
 await L.go(p,'/nueva-venta'); await L.shot(p,'cajero-pos-sinturno-desktop');
 await L.go(p,'/mi-turno'); await L.shot(p,'cajero-turno-cerrada-desktop');
 // input focus + button hover
 await p.getByLabel('Efectivo inicial').focus(); await L.shot(p,'cajero-turno-cerrada-inputfocus-desktop',false);
 await L.btn(p,'Abrir caja').hover(); await p.waitForTimeout(400); await L.shot(p,'cajero-turno-cerrada-btnhover-desktop',false);
 await p.getByLabel('Efectivo inicial').fill('5000'); await L.btn(p,'Abrir caja').click(); await p.waitForTimeout(600); await L.shot(p,'cajero-turno-abierta-flash-desktop');
 await L.settle(p,1500);
 await L.go(p,'/mi-turno'); await L.shot(p,'cajero-turno-abierta-desktop');
 await L.go(p,'/'); await L.shot(p,'cajero-home-cajaabierta-desktop');
 await L.go(p,'/nueva-venta'); await L.shot(p,'cajero-pos-carritovacio-desktop');
 // add items
 const adds = p.getByRole('button',{name:'Agregar', exact:true});
 console.log('agregar buttons', await adds.count());
 await adds.nth(0).click(); await L.settle(p,1200);
 await adds.nth(1).click(); await L.settle(p,1200);
 await adds.nth(1).click(); await L.settle(p,1200);
 await L.shot(p,'cajero-pos-carrito-desktop');
 // payment dropdown open
 await p.getByLabel('Medio de pago').click().catch(()=>{}); await p.waitForTimeout(600); await L.shot(p,'cajero-pos-mediopago-open-desktop',false);
 await p.keyboard.press('Escape'); await p.waitForTimeout(300);
 await L.btn(p,'Confirmar venta').click(); await L.settle(p,2000);
 await L.shot(p,'cajero-pos-ventaconfirmada-desktop');
 // second sale for tickets
 await p.getByRole('button',{name:'Agregar', exact:true}).nth(2).click(); await L.settle(p,1200);
 await L.btn(p,'Confirmar venta').click(); await L.settle(p,2000);
 await L.go(p,'/'); await L.shot(p,'cajero-home-conventas-desktop');
 await L.go(p,'/mis-tickets'); await L.shot(p,'cajero-tickets-desktop');
 await L.btn(p,'Anular ticket completo').click(); await L.settle(p,1200); await L.shot(p,'cajero-tickets-error-desktop');
 await L.go(p,'/mi-turno'); await L.shot(p,'cajero-turno-abierta-conventas-desktop');
 await b.close();
})();
