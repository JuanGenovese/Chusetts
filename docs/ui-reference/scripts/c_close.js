const L = require('./lib');
(async()=>{
 const b = await L.launch(); const c = await L.ctx(b,'desktop'); const p = await c.newPage();
 await L.login(p,'testcajero','testcajero');
 await L.go(p,'/mi-turno');
 await p.getByLabel('Efectivo contado físicamente').fill('4800');
 await p.getByLabel('Observación de cierre opcional').fill('Faltante de cambio');
 await L.shot(p,'cajero-turno-cierre-form-desktop');
 await L.btn(p,'Cerrar caja y generar backup').click(); await p.waitForTimeout(500); await L.settle(p,2000);
 await L.shot(p,'cajero-turno-cerrada-flash-historial-desktop');
 await L.go(p,'/mi-turno'); await L.shot(p,'cajero-turno-cerrada-historial-desktop');
 await b.close();
})();
