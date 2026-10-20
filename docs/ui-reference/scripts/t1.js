const L = require('./lib');
(async()=>{
 const b = await L.launch();
 for (const vp of ['desktop','mobile']) {
  const c = await L.ctx(b, vp); const p = await c.newPage();
  await p.goto(L.BASE+'/', {waitUntil:'networkidle'}); await L.settle(p,2000);
  await L.shot(p, `anon-login-default-${vp}`);
  // error
  await p.getByLabel('Usuario').fill('x'); await p.getByLabel('Contraseña').fill('bad');
  await p.getByRole('button',{name:'Ingresar'}).click(); await L.settle(p,1500);
  await L.shot(p, `anon-login-error-${vp}`);
  await c.close();
 }
 await b.close();
})();
