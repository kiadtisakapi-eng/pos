// Fault injection confined to child tests: verify fuzz runners reject an observable money mismatch.
const fixture=require('./fixtures_db');
const make=fixture.makeShop;
fixture.makeShop=async(...args)=>{
  const s=await make(...args);
  if(process.env.POS_FUZZ_FAULT==='checkout'){
    const checkout=s.app.processCheckout.bind(s.app);
    s.app.processCheckout=async(...args)=>{const ok=await checkout(...args);if(ok)s.app.state.transactions.at(-1).total+=1;return ok;};
  }else{
    const drawer=s.app.computeShiftDrawer.bind(s.app);
    s.app.computeShiftDrawer=(...args)=>{const r=drawer(...args);return {...r,expected:r.expected+1};};
  }
  return s;
};
