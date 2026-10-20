const L = require('./lib');
(async()=>{
 const b = await L.launch(); const c = await L.ctx(b,'desktop'); const p = await c.newPage();
 const step = async (name, fn) => { try { await fn(); } catch(e){ console.log('FAIL', name, String(e.message).split('\n')[0]); } };
 await L.login(p,'testadmin','testadmin');
 await step('inv', async()=>{ await L.go(p,'/productos'); await p.getByLabel('Buscar').fill('Pinta IPA'); await p.getByLabel('Buscar').press('Enter'); await L.settle(p,1500);
   await p.getByRole('button',{name:'Abrir ficha'}).first().click(); await L.settle(p,2000);
   await p.getByRole('tab',{name:'Inventario'}).click(); await L.settle(p,1200);
   await p.getByRole('button',{name:'Registrar ajuste'}).click(); await L.settle(p,1500); await L.shot(p,'admin-producto-inventario-error-desktop');
   await p.getByLabel('Motivo obligatorio').fill('Conteo semanal'); await p.getByRole('button',{name:'Registrar ajuste'}).click(); await p.waitForTimeout(600); await L.shot(p,'admin-producto-ajuste-ok-toast-desktop',false); await L.settle(p,2000); await L.shot(p,'admin-producto-ajuste-ok-desktop');
 });
 await step('desactivar', async()=>{ await p.getByRole('tab',{name:'Ficha'}).click(); await L.settle(p,1000); await L.shot(p,'admin-producto-ficha-bottom-desktop'); });
 await step('insumo', async()=>{ await L.go(p,'/productos'); await p.getByLabel('Buscar').fill('Fernet'); await p.getByLabel('Buscar').press('Enter'); await L.settle(p,1500);
   await p.getByRole('button',{name:'Abrir ficha'}).first().click(); await L.settle(p,2000); await L.shot(p,'admin-insumo-ficha-desktop'); });
 await step('dd', async()=>{ await L.go(p,'/'); await p.getByRole('tab',{name:'Mes actual'}).click(); await L.settle(p,1500); await L.shot(p,'admin-inicio-tab-mes-desktop');
   await p.getByRole('tab',{name:'Stock'}).click(); await L.settle(p,1500); await L.shot(p,'admin-inicio-tab-stock-desktop');
   await p.getByRole('button',{name:'Cargar gasto'}).click(); await L.settle(p,1500); await L.shot(p,'admin-dialog-gasto-desktop',false);});
 // dark mode samples
 await c.close();
 const cd = await L.ctx(b,'desktop',true); const q = await cd.newPage();
 await L.login(q,'testadmin','testadmin'); await L.shot(q,'admin-inicio-dark-desktop');
 await L.go(q,'/productos'); await L.shot(q,'admin-productos-lista-dark-desktop');
 await b.close();
})();
