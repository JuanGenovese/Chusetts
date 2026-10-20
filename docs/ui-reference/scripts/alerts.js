const L=require('./lib');
(async()=>{
 const b=await L.launch(); const c=await L.ctx(b,'desktop'); const p=await c.newPage(); const out={};
 const al=()=>p.evaluate(()=>[...document.querySelectorAll('[data-testid="stAlert"]')].map(e=>{const c=getComputedStyle(e);const i=e.querySelector('[data-testid^="stAlertContainer"]');return {kind:(i||e).getAttribute('data-testid'),bg:c.backgroundColor,color:c.color,border:c.border,radius:c.borderRadius,pad:c.padding,text:e.innerText.slice(0,40)}}));
 await p.goto(L.BASE+'/',{waitUntil:'networkidle'}); await L.settle(p,1500);
 await p.getByLabel('Usuario').fill('x'); await p.getByLabel('Contraseña').fill('y'); await L.btn(p,'Ingresar').click(); await L.settle(p,1500); out.error=await al();
 await L.login(p,'testcajero','testcajero'); await L.go(p,'/mis-tickets'); out.info=await al();
 await L.go(p,'/mi-turno'); out.warning=await al();
 await L.go(p,'/'); out.home=await al();
 await L.go(p,'/mi-turno'); await p.getByLabel('Efectivo inicial').fill('100'); await L.btn(p,'Abrir caja').click(); await L.settle(p,2000); out.success=await al();
 // toast sample
 await p.evaluate(()=>0);
 console.log(JSON.stringify(out,null,1));
 await b.close();
})();
