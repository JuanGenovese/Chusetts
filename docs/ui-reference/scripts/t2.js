const L = require('./lib');
(async()=>{
 const b = await L.launch();
 const c = await L.ctx(b,'desktop'); const p = await c.newPage();
 await L.login(p,'testcajero','testcajero');
 console.log(p.url());
 await L.shot(p,'cajero-home-cajacerrada-desktop');
 await b.close();
})();
