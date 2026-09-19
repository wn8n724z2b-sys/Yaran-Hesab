const KEY='hesabdari_asan_v1';
const AUTO_BACKUP_KEY='hesabdari_asan_auto_backup_latest_v1';
const DATA_SUPPORT_PASSWORD='admin';
const DEFAULT={
 settings:{storeName:'فروشگاه من',storeAddress:'',storePhone:'',storeLogo:'',receiptFooter:'سپاس از خرید شما',printerName:'XPrinter 80mm',autoPrint:false,autoCut:true,currency:'؋',theme:'light',hideDashboardMoney:false,scannerSuffix:'Enter',autoBackupPerDay:0,lastAutoBackupAt:'',onlineEnabled:false,onlineServerUrl:'',onlineStoreCode:'',onlineSyncMinutes:15,onlineSyncSales:true,onlineSyncInventory:true,onlineLastCheckAt:'',onlineLastSyncAt:'',onlineLastStatus:'local',workDayDate:'',workDayStartedAt:'',demoMode:false},
 categories:[{id:'cat-general',name:'عمومی'}],
 products:[],
 customers:[{id:'c0',name:'مشتری عمومی',phone:'',balance:0}],
 suppliers:[],
 sales:[],deletedSales:[],purchases:[],inventory:[],inventorySnapshots:[],expenses:[],supplierPayments:[],customerReceipts:[],financialPeriods:[],financialPeriod:null
};

let db=normalizeDB(loadRaw());
let cart=[];
let paymentMethod=null;
let lastSale=null;
let editingSaleId=null;
let checkoutBusy=false;
let lastCartMutation=null;
let dataSupportUnlocked=false;
let moneyVisible=!db.settings.hideDashboardMoney;
let dashboardChartRange='7';
let workStart=getWorkSessionStart();
let scannerDetectedAt=0;

const $=s=>document.querySelector(s), $$=s=>Array.prototype.slice.call(document.querySelectorAll(s));
function clone(x){return JSON.parse(JSON.stringify(x))}
function loadRaw(){try{if(window.YaranNative&&window.YaranNative.isNative){const raw=window.__YARAN_PRELOADED_STATE__;return raw?JSON.parse(raw):clone(DEFAULT)}return JSON.parse(localStorage.getItem(KEY))||clone(DEFAULT)}catch(e){return clone(DEFAULT)}}

function persistState(state){
 const raw=JSON.stringify(state);
 if(window.YaranNative&&window.YaranNative.isNative){window.YaranNative.persist(raw).catch(function(e){console.error(e);toast('ذخیره SQLite انجام نشد')});return true}
 try{localStorage.setItem(KEY,raw);return true}catch(e){return false}
}

function id(prefix){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]})}
function num(n){return new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Math.round(Number(n)||0))}
function amount(n){return new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n)||0)}
function money(n){return amount(n)+' ؋'}
function pad(n){return String(n).padStart(2,'0')}
function dateKey(d){d=d||new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function monthKey(d){d=d||new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)}
function formatTime(value){const d=new Date(value);return pad(d.getHours())+':'+pad(d.getMinutes())}
function formatDate(value){const d=new Date(value);return d.getFullYear()+'/'+pad(d.getMonth()+1)+'/'+pad(d.getDate())}
function formatDateTime(value){return formatDate(value)+'، '+formatTime(value)}
function normalizeText(value){return String(value||'').toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ]/g,'').trim()}
const DAY_NAMES=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
const ORDINALS=['','اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم','دهم','یازدهم','دوازدهم','سیزدهم','چهاردهم','پانزدهم','شانزدهم','هفدهم','هجدهم','نوزدهم','بیستم'];
function ordinalFa(n){n=Math.max(1,Math.round(Number(n)||1));return ORDINALS[n]||num(n)+'م'}
function accountingPeriodName(no){return 'دوره حسابی '+ordinalFa(no)}
function accountingMonthName(){return 'ماه '+ordinalFa(financialPeriodMonths())}

function normalizeDB(raw){
 const d=raw&&typeof raw==='object'?raw:clone(DEFAULT);
 d.settings=Object.assign({},DEFAULT.settings,d.settings||{});
 d.categories=Array.isArray(d.categories)&&d.categories.length?d.categories:clone(DEFAULT.categories);
 if(!d.categories.some(function(c){return c.id==='cat-general'}))d.categories.unshift({id:'cat-general',name:'عمومی'});
 d.products=(Array.isArray(d.products)?d.products:[]).map(function(p){
  let codes=Array.isArray(p.barcodes)?p.barcodes.slice(0,15):[];
  if(!codes.length&&p.barcode)codes=[String(p.barcode)];
  codes=codes.map(String).map(function(x){return x.trim()}).filter(Boolean).filter(function(x,i,a){return a.indexOf(x)===i}).slice(0,15);
  const units=Math.max(1,Number(p.unitsPerPurchase)||1), enabled=p.unitConversionEnabled!=null?!!p.unitConversionEnabled:units>1, pack=Number(p.packageBuyPrice)||((Number(p.buy)||0)*units); return Object.assign({id:id('p'),name:'',image:'',categoryId:'cat-general',producer:'',unitConversionEnabled:false,baseUnit:'دانه',purchaseUnit:'دانه',unitsPerPurchase:1,packageBuyPrice:0,buy:0,sell:0,stock:0,min:0},p,{barcodes:codes,barcode:codes[0]||'',image:p.image||'',categoryId:p.categoryId||'cat-general',producer:p.producer||'',unitConversionEnabled:enabled,baseUnit:p.baseUnit||'دانه',purchaseUnit:enabled?(p.purchaseUnit||'بسته'):(p.baseUnit||'دانه'),unitsPerPurchase:enabled?units:1,packageBuyPrice:enabled?pack:(Number(p.buy)||pack||0),buy:Number(p.buy)|| (pack/units)||0,sell:Number(p.sell)||0,stock:Number(p.stock)||0,min:Number(p.min)||0,variablePrice:false,costUnknown:false});
 });
 d.customers=Array.isArray(d.customers)?d.customers:clone(DEFAULT.customers);
 if(!d.customers.some(function(c){return c.id==='c0'}))d.customers.unshift({id:'c0',name:'مشتری عمومی',phone:'',balance:0});
 d.suppliers=Array.isArray(d.suppliers)?d.suppliers:clone(DEFAULT.suppliers);
 d.sales=(Array.isArray(d.sales)?d.sales:[]).map(function(s){if(s.payment==='کارت')s.payment='نقدی';return s});
 d.deletedSales=Array.isArray(d.deletedSales)?d.deletedSales:[];
 d.purchases=Array.isArray(d.purchases)?d.purchases:[];
 d.inventory=Array.isArray(d.inventory)?d.inventory:[];
 d.inventorySnapshots=Array.isArray(d.inventorySnapshots)?d.inventorySnapshots:[];
 d.expenses=Array.isArray(d.expenses)?d.expenses:[];
 d.supplierPayments=Array.isArray(d.supplierPayments)?d.supplierPayments:[];
 d.customerReceipts=Array.isArray(d.customerReceipts)?d.customerReceipts:[];
 d.financialPeriods=Array.isArray(d.financialPeriods)?d.financialPeriods:[];
 if(!d.financialPeriod||!d.financialPeriod.start)d.financialPeriod={no:(d.financialPeriods.length||0)+1,start:new Date().toISOString()};
 if(!d.financialPeriod.no)d.financialPeriod.no=(d.financialPeriods.length||0)+1;
 return d;
}
function save(){
 updateInventorySnapshot();let ok=true;
 try{ok=persistState(db)}
 catch(e){ok=false;toast('ذخیره اطلاعات انجام نشد؛ اگر عکس بزرگی انتخاب کرده‌اید آن را کوچک‌تر کنید.')}
 renderAll();return ok
}
async function saveWithAudit(auditEvent,rollbackState){
 updateInventorySnapshot();
 const raw=JSON.stringify(db);
 try{
  if(window.YaranNative&&window.YaranNative.isNative&&window.YaranNative.commit){
   await window.YaranNative.commit(raw,auditEvent);
  }else{
   persistState(db);
  }
  renderAll();
  return true;
 }catch(e){
  console.error('Hesabdari Asan transactional save failed:',e);
  if(rollbackState){
   db=normalizeDB(clone(rollbackState));
   if(!(window.YaranNative&&window.YaranNative.isNative)){try{localStorage.setItem(KEY,JSON.stringify(db))}catch(ignore){}}
  }
  renderAll();
  toast('ذخیره امن انجام نشد؛ تغییرات فاکتور برگشت داده شد');
  return false;
 }
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(function(){e.classList.remove('show')},1900)}
function currentInventoryValue(){return db.products.reduce(function(a,p){return a+(Number(p.buy)||0)*(Number(p.stock)||0)},0)}
function unknownInventoryCostCount(){return 0}
function updateInventorySnapshot(){const k=dateKey(),v=currentInventoryValue();let s=db.inventorySnapshots.find(function(x){return x.date===k});if(s)s.value=v;else db.inventorySnapshots.push({date:k,value:v});if(db.inventorySnapshots.length>365)db.inventorySnapshots=db.inventorySnapshots.slice(-365)}
function lastSaleNo(){return Math.max.apply(null,[0].concat(db.sales.map(function(s){return Number(s.no)||0}),db.deletedSales.map(function(s){return Number(s.no)||0})))}
function getEditingSale(){return editingSaleId?db.sales.find(function(s){return s.id===editingSaleId}):null}
function originalSaleQty(pid){const s=getEditingSale();if(!s)return 0;const i=(s.items||[]).find(function(x){return x.id===pid});return i?Number(i.qty)||0:0}
function availableStock(pid){const p=db.products.find(function(x){return x.id===pid});return p?(Number(p.stock)||0)+originalSaleQty(pid):0}
function invoiceSnapshot(s){return {id:s.id,no:s.no,time:s.time,items:clone(s.items||[]),subtotal:s.subtotal,discount:s.discount,total:s.total,payment:s.payment,customerId:s.customerId,editedAt:s.editedAt||null}}
function reverseSaleEffects(sale,reason){
 const now=new Date().toISOString();(sale.items||[]).forEach(function(i){const p=db.products.find(function(x){return x.id===i.id});if(p){p.stock=(Number(p.stock)||0)+(Number(i.qty)||0);db.inventory.push({id:id('inv'),time:now,productId:p.id,productName:p.name,type:reason||'اصلاح فاکتور',qty:Number(i.qty)||0,ref:'#'+sale.no})}});
 if(sale.payment==='نسیه'){const c=db.customers.find(function(x){return x.id===sale.customerId});if(c)c.balance=Math.max(0,(Number(c.balance)||0)-(Number(sale.total)||0))}
}
function applySaleEffects(sale,type){
 const now=new Date().toISOString();(sale.items||[]).forEach(function(i){const p=db.products.find(function(x){return x.id===i.id});if(p){p.stock=(Number(p.stock)||0)-(Number(i.qty)||0);db.inventory.push({id:id('inv'),time:now,productId:p.id,productName:p.name,type:type||'فروش',qty:-(Number(i.qty)||0),ref:'#'+sale.no})}});
 if(sale.payment==='نسیه'){const c=db.customers.find(function(x){return x.id===sale.customerId});if(c)c.balance=(Number(c.balance)||0)+(Number(sale.total)||0)}
}
function saleHasUnknownCost(s){return false}
function saleCost(s){return (s.items||[]).reduce(function(a,i){return a+(Number(i.buy)||0)*(Number(i.qty)||0)},0)}
function saleProfit(s){return saleHasUnknownCost(s)?null:(Number(s.total)||0)-saleCost(s)}
function customerDebt(){return db.customers.reduce(function(a,c){return a+(Number(c.balance)||0)},0)}
function supplierDebt(){return db.suppliers.reduce(function(a,c){return a+(Number(c.balance)||0)},0)}
function maskedMoney(v){if(v==null)return moneyVisible?'نامشخص':'••••••';return moneyVisible?money(v):'•••••• ؋'}

function getWorkSessionStart(){
 const today=dateKey();
 if(db.settings.workDayDate!==today||!db.settings.workDayStartedAt){
  db.settings.workDayDate=today;db.settings.workDayStartedAt=new Date().toISOString();
  try{persistState(db)}catch(e){}
 }
 return new Date(db.settings.workDayStartedAt);
}
function renderWorkSession(){
 const today=dateKey();if(db.settings.workDayDate!==today){workStart=getWorkSessionStart()}
 const ms=Math.max(0,Date.now()-workStart.getTime()),mins=Math.floor(ms/60000),h=Math.floor(mins/60),m=mins%60,sec=Math.floor(ms/1000)%60;
 $('#workSessionValue').textContent=pad(h)+':'+pad(m)+':'+pad(sec);
 $('#workSession').title='شروع اولین کار امروز: '+formatTime(workStart)+' · از باز و بسته شدن برنامه مستقل است';$('#clock').textContent=formatTime(new Date());
}

function addMonths(date,count){const d=new Date(date);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+count);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));return d}
function financialPeriodMonths(){const s=new Date(db.financialPeriod.start),n=new Date();let m=(n.getFullYear()-s.getFullYear())*12+(n.getMonth()-s.getMonth());if(n.getDate()<s.getDate())m--;return Math.max(1,m)}
function financialPeriodDue(){return new Date()>=addMonths(new Date(db.financialPeriod.start),6)}
function financialPeriodProgress(){const s=new Date(db.financialPeriod.start).getTime(),due=addMonths(new Date(db.financialPeriod.start),6).getTime(),now=Date.now();return Math.max(0,Math.min(100,((now-s)/(due-s))*100))}

function periodBounds(period){
 const now=new Date();
 if(period==='today'){const s=new Date(now);s.setHours(0,0,0,0);return {start:s,end:null}}
 if(period==='month'){return {start:new Date(now.getFullYear(),now.getMonth(),1),end:null}}
 if(period==='financial'){return {start:new Date(db.financialPeriod.start),end:null}}
 return {start:null,end:null};
}
function filterPeriod(list,period){const b=periodBounds(period);if(!b.start)return list.slice();return list.filter(function(x){const t=new Date(x.time);return t>=b.start&&(!b.end||t<=b.end)})}
function periodSales(period){return filterPeriod(db.sales,period)}
function periodExpenses(period){return filterPeriod(db.expenses,period)}
function periodSupplierPayments(period){return filterPeriod(db.supplierPayments,period)}
function periodCustomerReceipts(period){return filterPeriod(db.customerReceipts,period)}
function totalAmounts(list){return list.reduce(function(a,x){return a+(Number(x.amount)||0)},0)}
function cashSales(list){return list.filter(function(s){return s.payment==='نقدی'}).reduce(function(a,s){return a+(Number(s.total)||0)},0)}
function cashIn(period){return cashSales(periodSales(period))+totalAmounts(periodCustomerReceipts(period))}
function periodPurchases(period){return filterPeriod(db.purchases,period)}
function cashOut(period){return totalAmounts(periodExpenses(period))+totalAmounts(periodSupplierPayments(period))+periodPurchases(period).filter(function(x){return x.payment==='نقدی'}).reduce(function(a,x){return a+(Number(x.total)||0)},0)}
function netCash(period){return cashIn(period)-cashOut(period)}
function salesProfitPeriod(period){const list=periodSales(period);if(list.some(saleHasUnknownCost))return null;return list.reduce(function(a,s){return a+(saleProfit(s)||0)},0)}
function netProfitPeriod(period){const p=salesProfitPeriod(period);return p==null?null:p-totalAmounts(periodExpenses(period))}
function unknownProfitSalesCount(period){return periodSales(period).filter(saleHasUnknownCost).length}

function applyTheme(){document.documentElement.setAttribute('data-theme',db.settings.theme==='dark'?'dark':'light');$('#themeToggle').textContent=db.settings.theme==='dark'?'☀':'☾';$('#themeToggle').title=db.settings.theme==='dark'?'تم روشن':'دارک'}
const pageMeta={dashboard:['داشبورد','نمای کلی فروشگاه'],pos:['فروش','صندوق سریع و بارکدخوان'],products:['کالاها','عکس، قیمت، بارکد و موجودی'],inventory:['انبار','کاردکس و گردش موجودی'],parties:['اشخاص','مشتریان و شرکت‌ها'],reports:['گزارش‌ها','فروش، گردش پول و گزارش مالی'],settings:['تنظیمات','ظاهر، آنلاین، چاپگر، بارکد و Backup']};
function go(page){$$('.page').forEach(function(e){e.classList.remove('active')});const target=$('#page-'+page);target.classList.add('active');target.scrollTop=0;$$('.nav-item').forEach(function(e){e.classList.toggle('active',e.dataset.page===page)});$('#pageTitle').textContent=pageMeta[page][0];$('#pageSubtitle').textContent=pageMeta[page][1];$('.sidebar').classList.remove('open');if(page==='pos'){if(!editingSaleId&&!cart.length){paymentMethod=null;setCustomerSelection('c0');$$('.payment').forEach(function(x){x.classList.remove('active')});renderPaymentRequirement()}setTimeout(function(){$('#barcodeInput').focus()},30)}}
$$('.nav-item').forEach(function(b){b.onclick=function(){go(b.dataset.page)}});$$('[data-go]').forEach(function(b){b.onclick=function(){go(b.dataset.go)}});$('#newSaleTop').onclick=function(){if(!editingSaleId){paymentMethod=null;setCustomerSelection('c0');$$('.payment').forEach(function(x){x.classList.remove('active')});renderPaymentRequirement()}go('pos')};

function salesToday(){return periodSales('today')}
function salesThisMonth(){return periodSales('month')}
function dashboardChartDays(range){
 const now=new Date();now.setHours(12,0,0,0);let count=7,start=null;
 if(range==='30')count=30;
 if(range==='month'){start=new Date(now.getFullYear(),now.getMonth(),1,12,0,0,0);count=Math.max(1,Math.floor((now-start)/86400000)+1)}
 return Array.from({length:count},function(_,i){const d=start?new Date(start):new Date(now);if(start)d.setDate(start.getDate()+i);else d.setDate(now.getDate()-(count-1-i));return d});
}
function dailyFinancialPoint(d){
 const key=dateKey(d),sales=db.sales.filter(function(x){return dateKey(new Date(x.time))===key}),expenses=db.expenses.filter(function(x){return dateKey(new Date(x.time))===key});
 const total=sales.reduce(function(a,x){return a+(Number(x.total)||0)},0);
 const debt=sales.filter(function(x){return x.payment==='نسیه'}).reduce(function(a,x){return a+(Number(x.total)||0)},0);
 const unknown=sales.some(saleHasUnknownCost);
 const salesProfit=unknown?null:sales.reduce(function(a,x){return a+(saleProfit(x)||0)},0);
 const expense=expenses.reduce(function(a,x){return a+(Number(x.amount)||0)},0);
 return {date:d,sales:total,debt:debt,profit:salesProfit==null?null:salesProfit-expense};
}
function chartSmoothPath(points){
 if(!points.length)return '';let d='M '+points[0].x.toFixed(2)+' '+points[0].y.toFixed(2);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=(b.x-a.x)*.36;d+=' C '+(a.x+dx).toFixed(2)+' '+a.y.toFixed(2)+', '+(b.x-dx).toFixed(2)+' '+b.y.toFixed(2)+', '+b.x.toFixed(2)+' '+b.y.toFixed(2)}
 return d;
}
function chartValueLabel(v){if(!moneyVisible)return '••••';return amount(v)+' ؋'}
function renderFinanceChart(){
 const root=$('#financeChart');if(!root)return;
 const days=dashboardChartDays(dashboardChartRange),data=days.map(dailyFinancialPoint),W=820,H=286,L=62,R=18,T=18,B=43,plotW=W-L-R,plotH=H-T-B;
 const values=[];data.forEach(function(x){values.push(x.sales,x.debt);if(x.profit!=null)values.push(x.profit)});
 let min=Math.min.apply(null,[0].concat(values)),max=Math.max.apply(null,[1].concat(values));if(max===min)max=min+1;const rawSpan=max-min;max+=rawSpan*.08;if(min<0)min-=rawSpan*.06;else min=0;const span=max-min||1;
 const xFor=function(i){return data.length===1?L+plotW/2:L+(i/(data.length-1))*plotW},yFor=function(v){return T+((max-v)/span)*plotH},zeroY=yFor(0);
 const series=function(key){return data.map(function(x,i){return x[key]==null?null:{x:xFor(i),y:yFor(x[key]),v:x[key],i:i}}).filter(Boolean)};
 const salesPts=series('sales'),debtPts=series('debt'),profitPts=series('profit'),salesPath=chartSmoothPath(salesPts),debtPath=chartSmoothPath(debtPts),profitPath=chartSmoothPath(profitPts);
 const area=salesPts.length?salesPath+' L '+salesPts[salesPts.length-1].x.toFixed(2)+' '+zeroY.toFixed(2)+' L '+salesPts[0].x.toFixed(2)+' '+zeroY.toFixed(2)+' Z':'';
 let grid='',yLabels='';for(let i=0;i<5;i++){const ratio=i/4,y=T+plotH*ratio,v=max-span*ratio;grid+='<line class="chart-grid-line" x1="'+L+'" y1="'+y.toFixed(2)+'" x2="'+(W-R)+'" y2="'+y.toFixed(2)+'"></line>';yLabels+='<text class="chart-y-label" x="'+(L-10)+'" y="'+(y+4).toFixed(2)+'" text-anchor="end">'+(moneyVisible?esc(amount(v)):'•••')+'</text>'}
 const step=data.length<=8?1:data.length<=16?2:Math.max(3,Math.ceil(data.length/6));let xLabels='';data.forEach(function(x,i){if(i%step!==0&&i!==data.length-1)return;const label=data.length<=8?DAY_NAMES[x.date.getDay()]:pad(x.date.getDate())+'/'+pad(x.date.getMonth()+1);xLabels+='<text class="chart-x-label" x="'+xFor(i).toFixed(2)+'" y="'+(H-15)+'" text-anchor="middle">'+label+'</text>'});
 let hits='';data.forEach(function(x,i){const cx=xFor(i),half=data.length>1?plotW/(data.length-1)/2:plotW/2;hits+='<rect class="chart-hit" data-chart-index="'+i+'" x="'+Math.max(L,cx-half).toFixed(2)+'" y="'+T+'" width="'+Math.min(plotW,half*2).toFixed(2)+'" height="'+plotH+'"></rect>'});
 const dotSet=function(points,cls){if(data.length>14)return '';return points.map(function(p){return '<circle class="chart-point '+cls+'" cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="3.5"></circle>'}).join('')};
 root.innerHTML='<div class="finance-chart-stage"><svg class="finance-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img"><defs><linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--chart-sales)" stop-opacity=".20"></stop><stop offset="100%" stop-color="var(--chart-sales)" stop-opacity="0"></stop></linearGradient></defs>'+grid+'<line class="chart-zero-line" x1="'+L+'" y1="'+zeroY.toFixed(2)+'" x2="'+(W-R)+'" y2="'+zeroY.toFixed(2)+'"></line>'+yLabels+xLabels+(area?'<path class="chart-sales-area" d="'+area+'"></path>':'')+(salesPath?'<path class="chart-line sales" d="'+salesPath+'"></path>':'')+(debtPath?'<path class="chart-line debt" d="'+debtPath+'"></path>':'')+(profitPath?'<path class="chart-line profit" d="'+profitPath+'"></path>':'')+dotSet(salesPts,'sales')+dotSet(debtPts,'debt')+dotSet(profitPts,'profit')+hits+'</svg><div class="chart-hover-line"></div><div class="finance-chart-tooltip"></div></div>';
 const tooltip=root.querySelector('.finance-chart-tooltip'),hoverLine=root.querySelector('.chart-hover-line'),stage=root.querySelector('.finance-chart-stage');
 root.querySelectorAll('.chart-hit').forEach(function(hit){hit.onpointerenter=hit.onpointermove=function(e){const i=Number(hit.dataset.chartIndex),d=data[i],sr=stage.getBoundingClientRect(),svgX=xFor(i)/W*sr.width;hoverLine.style.left=svgX+'px';hoverLine.classList.add('show');const profitText=d.profit==null?'نامشخص':chartValueLabel(d.profit);tooltip.innerHTML='<b>'+formatDate(d.date)+'</b><span><i class="legend-dot sales"></i>فروش <strong>'+chartValueLabel(d.sales)+'</strong></span><span><i class="legend-dot debt"></i>قرض‌ها <strong>'+chartValueLabel(d.debt)+'</strong></span><span><i class="legend-dot profit"></i>مفاد خالص <strong>'+profitText+'</strong></span>';tooltip.classList.add('show');const desired=svgX+12,maxLeft=sr.width-190;tooltip.style.left=Math.max(8,Math.min(desired,maxLeft))+'px';tooltip.style.top='18px'};hit.onpointerleave=function(){tooltip.classList.remove('show');hoverLine.classList.remove('show')}});
 $$('.chart-range-btn').forEach(function(btn){btn.classList.toggle('active',btn.dataset.chartRange===dashboardChartRange);btn.onclick=function(){dashboardChartRange=btn.dataset.chartRange;renderFinanceChart()}});
}
function renderDashboard(){
 const s=salesToday(),total=s.reduce(function(a,x){return a+x.total},0),low=db.products.filter(function(p){return p.stock<=p.min}),months=financialPeriodMonths();
 $('#mSales').textContent=maskedMoney(total);$('#mSalesCount').textContent=num(s.length)+' فاکتور';
 $('#mNetProfit').textContent=maskedMoney(netProfitPeriod('today'));$('#mCustomerDebt').textContent=maskedMoney(customerDebt());$('#mInventoryValue').textContent=maskedMoney(currentInventoryValue());const unknownInv=unknownInventoryCostCount();$('#mInventorySnapshot').textContent=(unknownInv?num(unknownInv)+' کالا با بهای نامشخص · ':'')+'ارزش شناخته‌شده در '+formatDate(new Date());
 $('#mSupplierPaid').textContent=maskedMoney(totalAmounts(periodSupplierPayments('today')));$('#mSupplierDebt').textContent=maskedMoney(supplierDebt());$('#mLowStock').textContent=num(low.length);$('#mFinancialPeriod').innerHTML=accountingPeriodName(db.financialPeriod.no)+'<small class="period-month-line">('+accountingMonthName()+')</small>';
 $('#moneyToggleIcon').textContent=moneyVisible?'◉':'⊘';$('#moneyToggleText').textContent=moneyVisible?'پنهان کردن مبلغ‌ها':'نمایش مبلغ‌ها';
 $('#lowStockList').innerHTML=low.length?low.slice(0,7).map(function(p){return '<div class="list-row"><div><strong>'+esc(p.name)+'</strong><small>حداقل '+num(p.min)+' عدد</small></div><span class="pill danger">'+num(p.stock)+' باقی</span></div>'}).join(''):'<div class="list-row"><div><strong>هشدار موجودی ندارید</strong><small>وضعیت کالاها مناسب است.</small></div><span class="pill success">OK</span></div>';
 renderFinanceChart();
 $('#recentSales').innerHTML=db.sales.slice().reverse().slice(0,7).map(function(x){return '<tr><td>#'+num(x.no)+(x.editedAt?' <span class="edited-dot" title="ویرایش شده">•</span>':'')+'</td><td>'+formatTime(x.time)+'</td><td>'+num(x.items.reduce(function(a,i){return a+i.qty},0))+'</td><td>'+esc(x.payment)+'</td><td><b>'+(moneyVisible?money(x.total):'•••••• ؋')+'</b></td><td><div class="invoice-actions"><button class="tiny-btn edit-invoice" data-sale="'+x.id+'">ویرایش</button><button class="tiny-btn danger delete-invoice" data-sale="'+x.id+'">حذف</button></div></td></tr>'}).join('')||'<tr><td colspan="6" class="muted">هنوز فروشی ثبت نشده است.</td></tr>';bindInvoiceActions();
}
function productImageHtml(p,cls){return p.image?'<img class="'+cls+'" src="'+esc(p.image)+'" alt="">':'<span class="'+cls+' placeholder">'+esc((p.name||'آ').trim().charAt(0)||'آ')+'</span>'}
function rankProduct(p,q){
 const name=normalizeText(p.name),producer=normalizeText(p.producer),cat=db.categories.find(function(c){return c.id===p.categoryId}),category=normalizeText(cat?cat.name:''),codes=(p.barcodes||[]).map(normalizeText);if(codes.indexOf(q)>-1)return 0;if(name===q)return 1;if(name.startsWith(q))return 2;if(name.split(/\s+/).some(function(w){return w.startsWith(q)}))return 3;if(producer.startsWith(q)||category.startsWith(q))return 4;if(codes.some(function(c){return c.startsWith(q)}))return 5;if(name.indexOf(q)>-1||producer.indexOf(q)>-1||category.indexOf(q)>-1)return 6;if(codes.some(function(c){return c.indexOf(q)>-1}))return 7;return 99;
}
function searchProducts(term){const q=normalizeText(term);if(!q)return [];return db.products.map(function(p){return {p:p,r:rankProduct(p,q)}}).filter(function(x){return x.r<99}).sort(function(a,b){return a.r-b.r||normalizeText(a.p.name).localeCompare(normalizeText(b.p.name),'fa')}).map(function(x){return x.p})}
function productMatches(p,q){return rankProduct(p,normalizeText(q))<99}
function renderCategoryOptions(){
 const current=$('#categoryFilter').value||'all';$('#categoryFilter').innerHTML='<option value="all">همه دسته‌ها</option>'+db.categories.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+'</option>'}).join('');if(current==='all'||db.categories.some(function(c){return c.id===current}))$('#categoryFilter').value=current;
}
function categoryName(idv){const c=db.categories.find(function(x){return x.id===idv});return c?c.name:'عمومی'}
function productPriceText(p){return money(p.sell)+' / '+esc(p.baseUnit||'دانه')}
function renderProducts(){
 renderCategoryOptions();let q=($('#productSearch').value||'').trim(),filter=$('#productFilter').value||'all',catFilter=$('#categoryFilter').value||'all';
 let rows=db.products.filter(function(p){const special=filter==='low'?p.stock<=p.min:filter==='packaged'?!!p.unitConversionEnabled:true;return (!q||productMatches(p,q))&&special&&(catFilter==='all'||p.categoryId===catFilter)});if(q)rows=searchProducts(q).filter(function(p){const special=filter==='low'?p.stock<=p.min:filter==='packaged'?!!p.unitConversionEnabled:true;return special&&(catFilter==='all'||p.categoryId===catFilter)});
 $('#productsBody').innerHTML=rows.map(function(p){const enabled=!!p.unitConversionEnabled,units=Math.max(1,Number(p.unitsPerPurchase)||1),packLabel=enabled?num(units)+' '+esc(p.baseUnit)+' / '+esc(p.purchaseUnit):'تک‌واحد · '+esc(p.baseUnit);const meta='<div class="product-meta-line"><span class="meta-pill">'+esc(categoryName(p.categoryId))+'</span>'+(p.producer?'<span class="meta-pill">'+esc(p.producer)+'</span>':'')+(enabled?'<span class="meta-pill pack">تبدیل واحد فعال</span>':'<span class="meta-pill">تک‌واحد</span>')+'</div>';return '<tr><td><div class="product-name-cell">'+productImageHtml(p,'product-thumb')+'<div><b>'+esc(p.name)+'</b>'+meta+'</div></div></td><td><code class="barcode-code" title="'+esc(p.barcode||'—')+'">'+esc(p.barcode||'—')+'</code></td><td>'+num((p.barcodes||[]).length)+'/15</td><td><b>'+money(p.buy)+'</b><small class="table-sub">هر '+esc(p.baseUnit)+'</small></td><td>'+productPriceText(p)+'</td><td><span class="unit-conversion">'+packLabel+'</span></td><td><span class="pill '+(p.stock<=p.min?'danger':'success')+'">'+num(p.stock)+' '+esc(p.baseUnit)+'</span></td><td><div class="row-actions"><button class="tiny-btn purchase-product" data-id="'+p.id+'">+ خرید</button><button class="ghost-btn edit-product" data-id="'+p.id+'">ویرایش</button></div></td></tr>'}).join('')||'<tr><td colspan="8" class="muted">کالایی پیدا نشد.</td></tr>';
 $$('.edit-product').forEach(function(b){b.onclick=function(){openProduct(b.dataset.id)}});$$('.purchase-product').forEach(function(b){b.onclick=function(){openPurchase(b.dataset.id)}});
 const quick=$('#quickProducts');if(quick)quick.innerHTML='';
}
function inventoryStatus(p){if((Number(p.stock)||0)<=0)return 'out';if((Number(p.stock)||0)<=(Number(p.min)||0))return 'low';return 'ok'}
function renderInventory(){
 const out=db.products.filter(function(p){return inventoryStatus(p)==='out'}).length,low=db.products.filter(function(p){return inventoryStatus(p)==='low'}).length;
 $('#invProductCount').textContent=num(db.products.length);$('#invUnits').textContent=num(db.products.reduce(function(a,p){return a+(Number(p.stock)||0)},0));$('#invCost').textContent=money(currentInventoryValue());$('#invLow').textContent=num(out+low);if($('#invOutOfStockMeta'))$('#invOutOfStockMeta').textContent=num(out)+' ناموجود · '+num(low)+' رو به اتمام';
 const q=normalizeText($('#inventorySearch')?$('#inventorySearch').value:'');const f=$('#inventoryStatusFilter')?$('#inventoryStatusFilter').value:'all';
 const rows=db.products.filter(function(p){const st=inventoryStatus(p),match=!q||productMatches(p,q);return match&&(f==='all'||st===f)});
 if($('#inventoryStockBody'))$('#inventoryStockBody').innerHTML=rows.map(function(p){const st=inventoryStatus(p),label=st==='out'?'ناموجود':st==='low'?'رو به اتمام':'موجود',cls=st==='ok'?'success':'danger';return '<tr><td><div class="product-name-cell">'+productImageHtml(p,'product-thumb')+'<div><b>'+esc(p.name)+'</b><small>'+esc(p.barcode||'بدون بارکد')+'</small></div></div></td><td>'+esc(categoryName(p.categoryId))+'</td><td><b>'+num(p.stock)+' '+esc(p.baseUnit||'دانه')+'</b></td><td>'+num(p.min||0)+'</td><td>'+money((Number(p.stock)||0)*(Number(p.buy)||0))+'</td><td>'+money((Number(p.stock)||0)*(Number(p.sell)||0))+'</td><td><span class="pill '+cls+'">'+label+'</span></td></tr>'}).join('')||'<tr><td colspan="7" class="muted">کالایی در این وضعیت وجود ندارد.</td></tr>';
 $('#inventoryBody').innerHTML=db.inventory.slice().reverse().slice(0,80).map(function(x){return '<tr><td>'+formatDateTime(x.time)+'</td><td>'+esc(x.productName)+'</td><td>'+esc(x.type)+'</td><td dir="ltr"><b>'+(x.qty>0?'+':'')+num(x.qty)+'</b></td><td>'+esc(x.ref||'')+'</td></tr>'}).join('')||'<tr><td colspan="5" class="muted">گردش موجودی بعد از اولین خرید یا فروش نمایش داده می‌شود.</td></tr>';
 if($('#inventoryPurchases'))$('#inventoryPurchases').innerHTML=db.purchases.slice().reverse().slice(0,12).map(function(x){return '<div class="list-row"><div><strong>'+esc(x.productName||'خرید کالا')+'</strong><small>'+formatDateTime(x.time)+' · '+num(x.units||x.unitsAdded||x.quantity||x.qty||0)+' واحد</small></div><b>'+money(x.total||0)+'</b></div>'}).join('')||'<div class="muted padded">هنوز خریدی ثبت نشده است.</div>';
}
function setCustomerSelection(cid){
 cid=cid&&db.customers.some(function(c){return c.id===cid})?cid:'c0';const c=db.customers.find(function(x){return x.id===cid})||db.customers[0];
 const hidden=$('#customerSelect'),search=$('#customerSearch');if(hidden)hidden.value=cid;if(search)search.value=c?c.name:'مشتری عمومی';
}
function renderCustomers(){
 const selected=$('#customerSelect')?($('#customerSelect').value||'c0'):'c0';
 if($('#customerDatalist'))$('#customerDatalist').innerHTML=db.customers.map(function(c){return '<option value="'+esc(c.name)+'">'+esc(c.phone||'')+'</option>'}).join('');
 setCustomerSelection(selected);
 $('#customerList').innerHTML=db.customers.map(function(c){return '<div class="list-row"><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.phone||'بدون شماره')+' · قرضه '+money(c.balance||0)+'</small></div><div class="list-actions">'+((c.balance||0)>0?'<button class="ghost-btn receive-customer" data-id="'+c.id+'">دریافت قرض</button>':'')+'<span class="pill">مشتری</span></div></div>'}).join('');
 $$('.receive-customer').forEach(function(b){b.onclick=function(){openCustomerReceipt(b.dataset.id)}});
 $('#supplierList').innerHTML=db.suppliers.map(function(s){return '<div class="list-row"><div><strong>'+esc(s.name)+'</strong><small>'+esc(s.phone||'بدون شماره')+' · قرض '+money(s.balance||0)+'</small></div><div class="list-actions">'+((s.balance||0)>0?'<button class="ghost-btn pay-supplier" data-id="'+s.id+'">پرداخت قرض</button>':'')+'<span class="pill">شرکت</span></div></div>'}).join('')||'<div class="list-row"><div><strong>شرکتی ثبت نشده</strong><small>برای مدیریت قرض شرکت، یک شرکت اضافه کنید.</small></div></div>';
 $$('.pay-supplier').forEach(function(b){b.onclick=function(){openSupplierPayment(b.dataset.id)}})
}
function filteredSalesForReport(){
 let list=periodSales($('#reportPeriod').value||'financial'),q=normalizeText($('#invoiceReportSearch')?$('#invoiceReportSearch').value:''),pf=$('#invoicePaymentFilter')?$('#invoicePaymentFilter').value:'all';
 return list.filter(function(sale){if(pf!=='all'&&sale.payment!==pf)return false;if(!q)return true;const c=db.customers.find(function(x){return x.id===sale.customerId});return normalizeText(String(sale.no)).includes(q)||normalizeText(c?c.name:'').includes(q)||normalizeText(String(sale.total)).includes(q)});
}
function renderPeriodStatus(){
 const fp=db.financialPeriod,months=financialPeriodMonths(),progress=financialPeriodProgress(),start=new Date(fp.start);
 $('#financialPeriodTitle').textContent=accountingPeriodName(fp.no);
 $('#financialPeriodDates').textContent=accountingMonthName()+' · شروع '+formatDate(start)+' · تا امروز '+formatDate(new Date());
 $('#financialPeriodProgress').style.width=progress+'%';
 $('#financialPeriodStatus').textContent=(months>=6?'از مرز پیشنهادی 6 ماه گذشته است':'6 ماه، بازه پیشنهادی است')+' · شروع دوره جدید در هر زمان امکان‌پذیر است.';
 $('#startNewPeriodBtn').disabled=false;
}
function reportLabel(period){if(period==='today')return 'امروز';if(period==='month')return 'ماه جاری';if(period==='financial')return accountingPeriodName(db.financialPeriod.no)+' · '+accountingMonthName();return 'کل اطلاعات'}
function renderReports(){
 const period=$('#reportPeriod').value||'financial',list=periodSales(period),purchases=periodPurchases(period),purchaseTotal=purchases.reduce(function(a,x){return a+(Number(x.total)||0)},0),cashPurchaseTotal=purchases.filter(function(x){return x.payment==='نقدی'}).reduce(function(a,x){return a+(Number(x.total)||0)},0),total=list.reduce(function(a,s){return a+s.total},0),credit=list.filter(function(s){return s.payment==='نسیه'}).reduce(function(a,s){return a+s.total},0),discount=list.reduce(function(a,s){return a+(s.discount||0)},0),cost=list.reduce(function(a,s){return a+saleCost(s)},0),expenses=totalAmounts(periodExpenses(period)),supplierPaid=totalAmounts(periodSupplierPayments(period)),customerReceived=totalAmounts(periodCustomerReceipts(period)),salesProfit=salesProfitPeriod(period),netProfit=netProfitPeriod(period);
 $('#rCashToday').textContent=money(netCash('today'));$('#rCashMonth').textContent=money(netCash('month'));$('#rSalesPeriod').textContent=money(total);$('#rSalesPeriodMeta').textContent=num(list.length)+' فاکتور';$('#rNetProfitPeriod').textContent=netProfit==null?'نامشخص':money(netProfit);$('#rCustomerDebt').textContent=money(customerDebt());$('#rSupplierDebt').textContent=money(supplierDebt());$('#rExpensesPeriod').textContent=money(expenses);$('#rInventoryValue').textContent=money(currentInventoryValue());
 $('#financialSummaryTitle').textContent='خلاصه مالی '+reportLabel(period);
 $('#financialSummary').innerHTML=[
  ['فروش کل',money(total),'total'],['ورودی نقدی',money(cashIn(period)),''],['خروجی نقدی',money(cashOut(period)),''],['گردش خالص پول',money(netCash(period)),'total'],['فروش نسیه',money(credit),''],['دریافت قرض مشتریان',money(customerReceived),''],['بهای شناخته‌شده کالاهای فروخته‌شده',money(cost),''],['خرید کالا',money(purchaseTotal),''],['خرید نقدی',money(cashPurchaseTotal),''],['هزینه‌ها',money(expenses),''],['پرداخت قرض شرکت‌ها',money(supplierPaid),''],['تخفیف‌ها',money(discount),''],['سود فروش',salesProfit==null?'نامشخص':money(salesProfit),''],['سود خالص',netProfit==null?'نامشخص':money(netProfit),'total'],['قرضه مشتریان',money(customerDebt()),''],['قرض شرکت‌ها',money(supplierDebt()),'']
 ].map(function(x){return '<div class="summary-item '+x[2]+'"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>'}).join('');
 renderCashFlowMonth();renderPeriodStatus();
 const reportRows=filteredSalesForReport();if($('#invoiceReportStats')){const rc=reportRows.filter(function(x){return x.payment==='نقدی'}).reduce(function(a,x){return a+(Number(x.total)||0)},0),rd=reportRows.filter(function(x){return x.payment==='نسیه'}).reduce(function(a,x){return a+(Number(x.total)||0)},0),rt=reportRows.reduce(function(a,x){return a+(Number(x.total)||0)},0);$('#invoiceReportStats').innerHTML='<span>'+num(reportRows.length)+' فاکتور</span><span>نقدی '+money(rc)+'</span><span>نسیه '+money(rd)+'</span><b>مجموع '+money(rt)+'</b>'}$('#salesBody').innerHTML=reportRows.slice().reverse().map(function(s){const c=db.customers.find(function(x){return x.id===s.customerId});return '<tr><td>#'+num(s.no)+(s.editedAt?' <span class="edited-dot" title="ویرایش شده">•</span>':'')+'</td><td>'+formatDateTime(s.time)+'</td><td>'+esc(c?c.name:'—')+'</td><td>'+esc(s.payment)+'</td><td>'+num(s.items.reduce(function(a,i){return a+i.qty},0))+'</td><td><b>'+money(s.total)+'</b></td><td><div class="invoice-actions"><button class="tiny-btn edit-invoice" data-sale="'+s.id+'">ویرایش</button><button class="tiny-btn danger delete-invoice" data-sale="'+s.id+'">حذف</button></div></td></tr>'}).join('')||'<tr><td colspan="7" class="muted">در این بازه فروشی ثبت نشده است.</td></tr>';bindInvoiceActions();
}
function cashFlowDay(key){
 const sale=db.sales.filter(function(s){return s.payment==='نقدی'&&dateKey(new Date(s.time))===key}).reduce(function(a,s){return a+(Number(s.total)||0)},0),receipts=db.customerReceipts.filter(function(x){return dateKey(new Date(x.time))===key}).reduce(function(a,x){return a+(Number(x.amount)||0)},0),expenses=db.expenses.filter(function(x){return dateKey(new Date(x.time))===key}).reduce(function(a,x){return a+(Number(x.amount)||0)},0),supplier=db.supplierPayments.filter(function(x){return dateKey(new Date(x.time))===key}).reduce(function(a,x){return a+(Number(x.amount)||0)},0),purchases=db.purchases.filter(function(x){return x.payment==='نقدی'&&dateKey(new Date(x.time))===key}).reduce(function(a,x){return a+(Number(x.total)||0)},0);const input=sale+receipts,output=expenses+supplier+purchases;return {input:input,output:output,net:input-output};
}
function netCashForDay(key){return cashFlowDay(key).net}
function renderCashFlowMonth(){
 const root=$('#cashFlowBars');if(!root)return;
 const now=new Date(),lastDay=Math.max(now.getDate(),1),data=[];
 for(let day=1;day<=lastDay;day++){
  const key=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(day),v=cashFlowDay(key);
  data.push({day:day,input:v.input,output:v.output,net:v.net});
 }
 const totalIn=data.reduce(function(a,d){return a+d.input},0),totalOut=data.reduce(function(a,d){return a+d.output},0),totalNet=totalIn-totalOut;
 const hasData=data.some(function(d){return d.input!==0||d.output!==0});
 const summary='<div class="cf-summary"><div class="cf-summary-item"><span>ورودی ماه</span><b>'+maskedMoney(totalIn)+'</b></div><div class="cf-summary-item out"><span>خروجی ماه</span><b>'+maskedMoney(totalOut)+'</b></div><div class="cf-summary-item net"><span>خالص ماه</span><b>'+maskedMoney(totalNet)+'</b></div></div>';
 if(!hasData){
  root.innerHTML=summary+'<div class="chart-empty-state"><div class="chart-empty-icon">⌁</div><b>هنوز گردش نقدی در این ماه ثبت نشده است</b><span>با ثبت فروش نقدی، خرید، هزینه یا دریافت قرض، نمودار به‌صورت خودکار شکل می‌گیرد.</span></div>';
  return;
 }
 const W=900,H=220,L=26,R=18,T=22,B=30,pw=W-L-R,ph=H-T-B;
 const values=data.map(function(d){return d.net}),rawMax=Math.max.apply(null,[0].concat(values)),rawMin=Math.min.apply(null,[0].concat(values));
 let maxAbs=Math.max(Math.abs(rawMax),Math.abs(rawMin),1)*1.15,max=maxAbs,min=-maxAbs;
 if(rawMin>=0){min=0;max=Math.max(rawMax*1.18,1)}
 if(rawMax<=0){max=0;min=Math.min(rawMin*1.18,-1)}
 const span=max-min,xStep=pw/Math.max(1,data.length-1),x=function(i){return data.length===1?L+pw/2:L+xStep*i},y=function(v){return T+((max-v)/span)*ph},zeroY=y(0);
 let grid='';
 [0,.5,1].forEach(function(k){const yy=T+ph*k;grid+='<line class="cf-grid" x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'"></line>'});
 const pts=data.map(function(d,i){return {x:x(i),y:y(d.net),v:d.net}}),linePath=chartSmoothPath(pts),areaPath=pts.length?linePath+' L '+pts[pts.length-1].x+' '+zeroY+' L '+pts[0].x+' '+zeroY+' Z':'';
 let labels='',hits='',dots='';
 data.forEach(function(d,i){
  const cx=x(i),show=(i===0||i===data.length-1||d.day===5||d.day===10||d.day===15||d.day===20||d.day===25);
  if(show)labels+='<text class="cf-x" x="'+cx+'" y="'+(H-9)+'" text-anchor="middle">'+num(d.day)+'</text>';
  const hitW=data.length===1?pw:Math.max(12,xStep);
  hits+='<rect class="cf-hit" data-cf="'+i+'" x="'+Math.max(L,cx-hitW/2)+'" y="'+T+'" width="'+hitW+'" height="'+ph+'"></rect>';
  if(show||i===data.length-1)dots+='<circle class="cf-net-dot '+(d.net<0?'negative':'')+'" cx="'+cx+'" cy="'+y(d.net)+'" r="3"></circle>';
 });
 root.innerHTML=summary+'<div class="cf-stage"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><defs><linearGradient id="cfNetGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".16"/><stop offset="100%" stop-color="var(--accent)" stop-opacity=".015"/></linearGradient></defs>'+grid+'<line class="cf-zero" x1="'+L+'" y1="'+zeroY+'" x2="'+(W-R)+'" y2="'+zeroY+'"></line><path class="cf-net-area" d="'+areaPath+'"></path><path class="cf-net-line" d="'+linePath+'"></path>'+dots+labels+hits+'</svg><div class="cf-tooltip"></div></div>';
 const tt=root.querySelector('.cf-tooltip'),stage=root.querySelector('.cf-stage');
 root.querySelectorAll('.cf-hit').forEach(function(hit){
  hit.onpointerenter=hit.onpointermove=function(e){
   const d=data[Number(hit.dataset.cf)],r=stage.getBoundingClientRect();
   tt.innerHTML='<b>روز '+num(d.day)+'</b><span>ورودی <strong>'+maskedMoney(d.input)+'</strong></span><span>خروجی <strong>'+maskedMoney(d.output)+'</strong></span><span>خالص <strong class="'+(d.net<0?'negative':'')+'">'+maskedMoney(d.net)+'</strong></span>';
   tt.classList.add('show');tt.style.left=Math.min(r.width-178,Math.max(8,e.clientX-r.left+10))+'px';tt.style.top=Math.max(8,e.clientY-r.top-60)+'px'
  };
  hit.onpointerleave=function(){tt.classList.remove('show')}
 });
}
function renderBrandIdentity(){const mark=$('.brand-mark'),logo=db.settings.storeLogo||'';mark.classList.toggle('has-logo',!!logo);mark.innerHTML=logo?'<img src="'+esc(logo)+'" alt="لوگو">':'آ';const prev=$('#storeLogoPreview');if(prev)prev.innerHTML=logo?'<img src="'+esc(logo)+'" alt="لوگو">':'آ'}
function renderAutoBackupStatus(){const x=getLatestAutoBackup(),el=$('#autoBackupStatus');if(el)el.textContent='آخرین پشتیبان خودکار: '+(x&&x.time?formatDateTime(x.time):'—')}
function renderDataSupportAccess(){const lock=$('#dataSupportLock'),controls=$('#dataSupportControls');if(!lock||!controls)return;lock.classList.toggle('hidden',dataSupportUnlocked);controls.classList.toggle('hidden',!dataSupportUnlocked)}
function renderSettings(){const s=db.settings;$('#storeName').value=s.storeName;$('#storeAddress').value=s.storeAddress||'';$('#storePhone').value=s.storePhone;$('#receiptFooter').value=s.receiptFooter;$('#printerName').value=s.printerName;$('#autoPrint').checked=!!s.autoPrint;$('#autoCut').checked=!!s.autoCut;$('#themeSelect').value=s.theme||'light';$('#scannerSuffix').value=s.scannerSuffix||'Enter';$('#autoBackupPerDay').value=String(s.autoBackupPerDay||0);renderBrandIdentity();renderAutoBackupStatus();renderDataSupportAccess();renderOnlineSettings();applyTheme()}
function pulseCart(){const el=$('.pos-main');if(!el)return;el.classList.remove('soft-pulse');void el.offsetWidth;el.classList.add('soft-pulse');setTimeout(function(){el.classList.remove('soft-pulse')},430)}
function renderCart(){
 const body=$('#cartBody'),editing=!!getEditingSale();
 body.innerHTML=cart.map(function(i){const priceCell=editing?'<div class="cart-price-edit"><input class="cart-price-input" data-id="'+i.id+'" type="number" min="0" step="any" value="'+Number(i.sell||0)+'"><span>؋</span></div>':money(i.sell);return '<tr><td><div class="product-name-cell">'+productImageHtml(i,'product-thumb')+'<div><b>'+esc(i.name)+'</b><small style="display:block;color:var(--muted);direction:ltr;text-align:right">'+esc(i.barcode)+'</small></div></div></td><td><div class="qty"><button data-act="inc" data-id="'+i.id+'">+</button><b>'+num(i.qty)+'</b><small>'+esc(i.baseUnit||'دانه')+'</small><button data-act="dec" data-id="'+i.id+'">−</button></div></td><td>'+priceCell+'</td><td><b>'+money(i.sell*i.qty)+'</b></td><td><button class="delete-btn" data-act="del" data-id="'+i.id+'">×</button></td></tr>'}).join('');
 const empty=!cart.length;$('#emptyCart').style.display=empty?'flex':'none';$('.cart-wrap').style.display=empty?'none':'block';$$('[data-act]').forEach(function(b){b.onclick=function(){cartAction(b.dataset.act,b.dataset.id)}});$$('.cart-price-input').forEach(function(inp){inp.oninput=function(){const item=cart.find(function(x){return x.id===inp.dataset.id});if(item){item.sell=Math.max(0,Number(inp.value)||0);renderCart()}}});
 const subtotal=cart.reduce(function(a,i){return a+i.sell*i.qty},0),disc=Math.max(0,Number($('#discountInput').value)||0),total=Math.max(0,subtotal-disc);$('#sumSubtotal').textContent=money(subtotal);$('#sumTotal').textContent=money(total);const current=getEditingSale();$('#invoiceNo').textContent=current?'#'+String(current.no).padStart(6,'0')+' · ویرایش':'#'+String(lastSaleNo()+1).padStart(6,'0');$('#checkoutBtn').textContent=current?'ذخیره ویرایش فاکتور':'ثبت و پرداخت';$('#clearCart').textContent=current?'لغو ویرایش':'پاک کردن'
}
function renderAll(){updateInventorySnapshot();renderDashboard();renderProducts();renderInventory();renderCustomers();renderReports();renderSettings();renderCart();renderWorkSession()}

function addCartItem(p,overrides){let i=cart.find(function(x){return x.id===p.id}),available=availableStock(p.id);if(i){if(i.qty>=available){toast('موجودی کافی نیست');return}i.qty++;lastCartMutation={id:p.id,type:'inc'}}else{if(available<=0){toast('موجودی این کالا صفر است');return}cart.push(Object.assign({},clone(p),overrides||{},{qty:1}));lastCartMutation={id:p.id,type:'add'}}renderCart();pulseCart()}
function addToCart(pid){const p=db.products.find(function(x){return x.id===pid});if(!p)return;if(availableStock(pid)<=0){toast('موجودی این کالا صفر است');return}addCartItem(p)}
function renderPosSearch(term){
 const box=$('#posSearchResults'),q=String(term||'').trim();if(!q){box.classList.add('hidden');box.innerHTML='';return}
 const rows=searchProducts(q);if(!rows.length){box.classList.remove('hidden');box.innerHTML='<div class="search-result-item"><div class="search-result-main"><div><b>کالایی پیدا نشد</b><small>عبارت دیگری بنویسید</small></div></div></div>';return}
 box.classList.remove('hidden');box.innerHTML=rows.map(function(p){return '<button class="search-result-item" data-id="'+p.id+'"><span class="search-result-main">'+productImageHtml(p,'product-thumb')+'<span><b>'+esc(p.name)+'</b><small>'+esc(p.barcode||'بدون بارکد')+' · موجودی '+num(p.stock)+'</small></span></span><span class="search-result-price">'+productPriceText(p)+'</span></button>'}).join('');
 $$('.search-result-item[data-id]').forEach(function(b){b.onclick=function(){addToCart(b.dataset.id);$('#barcodeInput').value='';renderPosSearch('');$('#barcodeInput').focus()}});
}
function findAndAdd(term){term=String(term||'').trim();if(!term)return false;const q=normalizeText(term),exact=db.products.find(function(x){return (x.barcodes||[]).some(function(b){return normalizeText(b)===q})})||db.products.find(function(x){return normalizeText(x.name)===q});const p=exact||searchProducts(term)[0];if(p){addToCart(p.id);return true}toast('کالا پیدا نشد: '+term);return false}
function cartAction(a,pid){let i=cart.find(function(x){return x.id===pid}),p=db.products.find(function(x){return x.id===pid});if(!i)return;if(a==='inc'){if(i.qty<availableStock(pid))i.qty++;else toast('موجودی کافی نیست')}if(a==='dec'){i.qty--;if(i.qty<=0)cart=cart.filter(function(x){return x.id!==pid})}if(a==='del')cart=cart.filter(function(x){return x.id!==pid});renderCart()}
$('#barcodeInput').addEventListener('input',function(e){renderPosSearch(e.target.value)});
$('#barcodeInput').addEventListener('keydown',function(e){const suffix=db.settings.scannerSuffix||'Enter';if(e.key===suffix||e.key==='Enter'){e.preventDefault();if(e.target.value.length>=5)markScannerDetected(e.target.value);if(findAndAdd(e.target.value)){e.target.value='';renderPosSearch('')}}if(e.key==='Escape'){e.target.value='';renderPosSearch('')}});
$('#discountInput').oninput=renderCart;$('#clearCart').onclick=function(){cart=[];$('#discountInput').value=0;if(editingSaleId){editingSaleId=null;paymentMethod=null;setCustomerSelection('c0');$$('.payment').forEach(function(x){x.classList.remove('active')});renderPaymentRequirement();toast('ویرایش فاکتور لغو شد')}renderCart()};
if($('#undoLastCart'))$('#undoLastCart').onclick=function(){if(!lastCartMutation){toast('عملی برای برگشت وجود ندارد');return}const i=cart.find(function(x){return x.id===lastCartMutation.id});if(i){if(lastCartMutation.type==='add'||i.qty<=1)cart=cart.filter(function(x){return x.id!==lastCartMutation.id});else i.qty=Math.max(1,i.qty-1);renderCart();toast('آخرین قلم برگشت داده شد')}lastCartMutation=null};
function renderPaymentRequirement(alertMode){const n=$('#paymentRequiredNote');if(!n)return;n.classList.toggle('selected',!!paymentMethod);n.classList.toggle('attention',!!alertMode&&!paymentMethod);n.textContent=paymentMethod?'روش پرداخت: '+paymentMethod:'روش پرداخت را انتخاب کنید'}
$$('.payment').forEach(function(b){b.onclick=function(){$$('.payment').forEach(function(x){x.classList.remove('active')});b.classList.add('active');paymentMethod=b.dataset.pay;renderPaymentRequirement(false)}});
function resolveCustomerSearch(){const q=normalizeText($('#customerSearch').value),exact=db.customers.find(function(c){return normalizeText(c.name)===q||normalizeText(c.phone)===q});if(exact){setCustomerSelection(exact.id);return}const hit=db.customers.find(function(c){return normalizeText(c.name).startsWith(q)||normalizeText(c.phone).includes(q)});if(hit&&q){setCustomerSelection(hit.id)}else if(!q)setCustomerSelection('c0')}if($('#customerSearch')){$('#customerSearch').onchange=resolveCustomerSearch;$('#customerSearch').onblur=resolveCustomerSearch;$('#customerSearch').onfocus=function(){this.select()}}
async function checkout(){
 if(checkoutBusy)return;
 if(!cart.length){toast('فاکتور خالی است');return}
 if(!paymentMethod){toast('روش پرداخت را انتخاب کنید: نقدی یا نسیه');renderPaymentRequirement(true);return}
 const subtotal=cart.reduce(function(a,i){return a+i.sell*i.qty},0),discount=Math.max(0,Number($('#discountInput').value)||0),total=Math.max(0,subtotal-discount),original=getEditingSale(),no=original?original.no:lastSaleNo()+1;
 for(let c=0;c<cart.length;c++){const i=cart[c],p=db.products.find(function(x){return x.id===i.id});if(!p||availableStock(i.id)<i.qty){toast('موجودی '+i.name+' کافی نیست');return}}
 checkoutBusy=true;$('#checkoutBtn').disabled=true;
 const beforeDB=clone(db);
 try{
  if(original){
   const beforeSale=invoiceSnapshot(original),revisions=Array.isArray(original.revisions)?original.revisions.slice():[];revisions.push({editedAt:new Date().toISOString(),snapshot:beforeSale});
   reverseSaleEffects(original,'برگشت برای ویرایش');
   const updated={id:original.id,no:original.no,time:original.time,items:clone(cart),subtotal:subtotal,discount:discount,total:total,payment:paymentMethod,customerId:$('#customerSelect').value,editedAt:new Date().toISOString(),revisions:revisions};
   applySaleEffects(updated,'ویرایش فروش');
   const idx=db.sales.findIndex(function(x){return x.id===original.id});if(idx>-1)db.sales[idx]=updated;
   const ok=await saveWithAudit({action:'invoice.update',entityType:'invoice',entityId:updated.id,invoiceNo:Number(updated.no)||0,actor:'Admin',createdAt:updated.editedAt,payload:{before:beforeSale,after:invoiceSnapshot(updated),summary:'ویرایش فاکتور'}},beforeDB);
   if(!ok)return;
   lastSale=updated;editingSaleId=null;cart=[];$('#discountInput').value=0;paymentMethod=null;setCustomerSelection('c0');$$('.payment').forEach(function(x){x.classList.remove('active')});renderPaymentRequirement();renderCart();toast('فاکتور #'+num(no)+' ویرایش شد');if(db.settings.autoPrint)printReceipt(updated);return;
  }
  const sale={id:id('s'),no:no,time:new Date().toISOString(),items:clone(cart),subtotal:subtotal,discount:discount,total:total,payment:paymentMethod,customerId:$('#customerSelect').value,revisions:[]};
  applySaleEffects(sale,'فروش');db.sales.push(sale);
  const ok=await saveWithAudit({action:'invoice.create',entityType:'invoice',entityId:sale.id,invoiceNo:Number(sale.no)||0,actor:'Admin',createdAt:sale.time,payload:{after:invoiceSnapshot(sale),summary:'ثبت فاکتور جدید'}},beforeDB);
  if(!ok)return;
  lastSale=sale;cart=[];$('#discountInput').value=0;paymentMethod=null;setCustomerSelection('c0');$$('.payment').forEach(function(x){x.classList.remove('active')});renderPaymentRequirement();renderCart();toast('فاکتور #'+num(no)+' ثبت شد');if(db.settings.autoPrint)printReceipt(sale)
 }finally{
  checkoutBusy=false;$('#checkoutBtn').disabled=false;
 }
}
$('#checkoutBtn').onclick=checkout;
function editInvoice(saleId){
 const sale=db.sales.find(function(s){return s.id===saleId});if(!sale)return;editingSaleId=sale.id;cart=clone(sale.items||[]);paymentMethod=sale.payment||'نقدی';$('#discountInput').value=Number(sale.discount)||0;$$('.payment').forEach(function(x){x.classList.toggle('active',x.dataset.pay===paymentMethod)});renderCustomers();if(sale.customerId&&db.customers.some(function(c){return c.id===sale.customerId}))setCustomerSelection(sale.customerId);renderPaymentRequirement();go('pos');renderCart();toast('فاکتور #'+num(sale.no)+' برای ویرایش باز شد')
}
function deleteInvoice(saleId){
 const sale=db.sales.find(function(s){return s.id===saleId});if(!sale)return;
 openModal('حذف فاکتور #'+num(sale.no),'<div class="confirm-card danger-confirm"><div class="confirm-icon">!</div><h4>فاکتور حذف شود؟</h4><p>موجودی کالاها و قرض مشتری بر اساس این فاکتور برگردانده می‌شود. یک نسخه از فاکتور حذف‌شده در سابقه داخلی حسابداری آسان نگه‌داری خواهد شد.</p><div class="confirm-summary"><span>مبلغ فاکتور</span><b>'+money(sale.total)+'</b></div><div class="modal-actions"><button id="cancelDeleteInvoice" class="ghost-btn">انصراف</button><button id="confirmDeleteInvoice" class="danger-btn">حذف فاکتور</button></div></div>');
 $('#cancelDeleteInvoice').onclick=closeModal;$('#confirmDeleteInvoice').onclick=async function(){const beforeDB=clone(db),beforeSale=invoiceSnapshot(sale),deletedAt=new Date().toISOString();reverseSaleEffects(sale,'حذف فاکتور');db.deletedSales.push(Object.assign({},clone(sale),{deletedAt:deletedAt}));db.sales=db.sales.filter(function(s){return s.id!==saleId});const ok=await saveWithAudit({action:'invoice.delete',entityType:'invoice',entityId:sale.id,invoiceNo:Number(sale.no)||0,actor:'Admin',createdAt:deletedAt,payload:{before:beforeSale,after:{status:'deleted',deletedAt:deletedAt},summary:'حذف فاکتور'}},beforeDB);if(!ok)return;if(editingSaleId===saleId){editingSaleId=null;cart=[]}if(lastSale&&lastSale.id===saleId)lastSale=null;closeModal();renderCart();toast('فاکتور #'+num(sale.no)+' حذف شد')}
}
function bindInvoiceActions(){
 $$('.edit-invoice').forEach(function(b){b.onclick=function(){editInvoice(b.dataset.sale)}});$$('.delete-invoice').forEach(function(b){b.onclick=function(){deleteInvoice(b.dataset.sale)}})
}

function openModal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}
$('#modalClose').onclick=closeModal;$('#modal').onclick=function(e){if(e.target===$('#modal'))closeModal()};
function barcodeRowsHtml(codes){return codes.map(function(code,i){return '<div class="barcode-row"><span class="barcode-index">'+num(i+1)+'</span><input class="barcode-entry" value="'+esc(code)+'" placeholder="بارکد '+num(i+1)+'"><button class="remove-barcode" type="button" title="حذف">×</button></div>'}).join('')}
function resizeImage(file){return new Promise(function(resolve,reject){if(!file||!file.type||file.type.indexOf('image/')!==0){reject(new Error('invalid'));return}const reader=new FileReader();reader.onload=function(){const img=new Image();img.onload=function(){const max=520,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);resolve(canvas.toDataURL('image/jpeg',.82))};img.onerror=reject;img.src=reader.result};reader.onerror=reject;reader.readAsDataURL(file)})}
function openProduct(pid){
 pid=pid||null;const original=pid?db.products.find(function(x){return x.id===pid}):null,p=original||{name:'',barcodes:[''],image:'',categoryId:'cat-general',producer:'',unitConversionEnabled:false,baseUnit:'دانه',purchaseUnit:'بسته',unitsPerPurchase:1,packageBuyPrice:0,buy:0,sell:0,stock:0,min:0};let imageData=p.image||'',codes=(p.barcodes&&p.barcodes.length?p.barcodes:['']).slice(0,15),categoryOptions=db.categories.map(function(c){return '<option value="'+c.id+'" '+(c.id===p.categoryId?'selected':'')+'>'+esc(c.name)+'</option>'}).join('');
 const unitsList=['دانه','عدد','بسته','جعبه','کارتن','دوجین','رول','متر','کیلو','لیتر'];
 function unitSelect(value){return unitsList.map(function(u){return '<option '+(u===(value||'دانه')?'selected':'')+'>'+u+'</option>'}).join('')}
 openModal(pid?'ویرایش کالا':'کالای جدید','<form id="productForm" class="modal-form product-form-v2"><div class="product-editor-top"><div><div id="imageUploader" class="image-uploader"><input id="productImageInput" type="file" accept="image/*"><div id="productImagePreview"></div><strong>عکس کالا</strong><small>برای انتخاب عکس کلیک کنید.</small></div><div class="image-actions"><button type="button" id="removeProductImage" class="tiny-btn">حذف عکس</button></div></div><div class="form-grid"><label class="field" style="grid-column:1/-1"><span>نام کالا</span><input name="name" required value="'+esc(p.name)+'"></label><label class="field" style="grid-column:1/-1"><span>شرکت تولیدکننده <small>(اختیاری)</small></span><input name="producer" value="'+esc(p.producer||'')+'" placeholder="مثلاً برند یا شرکت تولیدکننده"></label><label class="field category-field"><span>دسته‌بندی</span><div class="category-select-row"><select id="productCategorySelect" name="categoryId">'+categoryOptions+'</select><button id="quickAddCategory" type="button" class="tiny-btn accent">+ دسته</button></div><div id="quickCategoryBox" class="quick-category-box hidden"><input id="quickCategoryName" placeholder="نام دسته جدید"><button id="saveQuickCategory" type="button" class="primary-btn">ایجاد</button></div></label><label class="field"><span>قیمت فروش هر واحد</span><div class="input-with-suffix"><input name="sell" type="number" min="0" value="'+Number(p.sell||0)+'"><span>؋</span></div></label><label class="field"><span>موجودی فعلی</span><input name="stock" type="number" min="0" value="'+Number(p.stock||0)+'"></label><label class="field"><span>حداقل موجودی</span><input name="min" type="number" min="0" value="'+Number(p.min||0)+'"></label></div></div><section class="unit-mode-card"><label class="unit-mode-switch"><span><b>تبدیل واحد خرید و فروش</b><small>برای کالاهایی که جعبه/بسته خریده و دانه‌ای می‌فروشید.</small></span><input id="unitConversionEnabled" type="checkbox" '+(p.unitConversionEnabled?'checked':'')+'></label><div id="simpleUnitBox" class="unit-simple"><div class="unit-grid"><label class="field"><span>واحد کالا</span><select name="simpleBaseUnit">'+unitSelect(p.baseUnit)+'</select></label><label class="field"><span>قیمت خرید هر واحد</span><div class="input-with-suffix"><input id="simpleBuyPrice" name="simpleBuyPrice" type="number" min="0" value="'+Number(p.buy||0)+'"><span>؋</span></div></label></div></div><div id="conversionUnitBox" class="unit-box"><div class="section-title"><div><h4>تبدیل واحد</h4><p>مثلاً یک جعبه 24 دانه؛ سیستم بهای هر دانه را خودکار محاسبه می‌کند.</p></div><span class="soft-badge">خودکار</span></div><div class="unit-grid"><label class="field"><span>واحد فروش</span><select name="baseUnit">'+unitSelect(p.baseUnit)+'</select></label><label class="field"><span>واحد خرید</span><select name="purchaseUnit">'+unitSelect(p.purchaseUnit||'بسته')+'</select></label><label class="field"><span>تعداد داخل هر واحد خرید</span><input id="unitsPerPurchase" name="unitsPerPurchase" type="number" min="1" value="'+Math.max(1,Number(p.unitsPerPurchase)||1)+'"></label><label class="field"><span>قیمت خرید یک واحد خرید</span><div class="input-with-suffix"><input id="packageBuyPrice" name="packageBuyPrice" type="number" min="0" value="'+Number(p.packageBuyPrice||0)+'"><span>؋</span></div></label></div><div class="unit-result"><span>بهای محاسبه‌شده هر <b id="unitResultName">'+esc(p.baseUnit||'دانه')+'</b></span><strong id="unitCostPreview">'+money(p.buy||0)+'</strong><small id="unitFormula">قیمت خرید ÷ تعداد داخل واحد خرید</small></div></div></section><section class="barcode-section"><div class="barcode-section-head"><div><h4>بارکدهای کالا</h4><small>بارکد اول، بارکد اصلی است.</small></div><button type="button" id="addBarcode" class="ghost-btn">+ افزودن بارکد</button></div><div id="barcodeList" class="barcode-list">'+barcodeRowsHtml(codes)+'</div><div class="barcode-limit"><span id="barcodeCount">'+num(codes.length)+'</span> از 15 بارکد</div></section><div class="modal-actions"><button type="button" id="cancelProduct" class="ghost-btn">انصراف</button><button class="primary-btn">ذخیره کالا</button></div></form>');
 const preview=$('#productImagePreview'),fileInput=$('#productImageInput'),unitsInput=$('#unitsPerPurchase'),packageInput=$('#packageBuyPrice'),baseUnitSelect=$('#productForm [name="baseUnit"]'),conversionToggle=$('#unitConversionEnabled');
 function renderPreview(){preview.innerHTML=imageData?'<img src="'+esc(imageData)+'" alt="عکس کالا">':'<div class="image-placeholder">◫</div>'}
 function refreshBarcodeRows(){const rows=$$('#barcodeList .barcode-row');rows.forEach(function(row,i){row.querySelector('.barcode-index').textContent=num(i+1);row.querySelector('.remove-barcode').style.visibility=rows.length===1?'hidden':'visible'});$('#barcodeCount').textContent=num(rows.length);$('#addBarcode').disabled=rows.length>=15;$$('.remove-barcode').forEach(function(btn){btn.onclick=function(){btn.parentElement.remove();refreshBarcodeRows()}})}
 function refreshUnitCost(){const units=Math.max(1,Number(unitsInput.value)||1),pack=Number(packageInput.value)||0,cost=pack/units;$('#unitCostPreview').textContent=money(cost);$('#unitResultName').textContent=baseUnitSelect.value||'دانه';$('#unitFormula').textContent=pack?amount(pack)+' ؋ ÷ '+num(units)+' = '+money(cost):'قیمت خرید واحد خرید را وارد کنید'}
 function toggleUnitMode(){const enabled=conversionToggle.checked;$('#simpleUnitBox').classList.toggle('hidden',enabled);$('#conversionUnitBox').classList.toggle('hidden',!enabled)}
 renderPreview();refreshBarcodeRows();refreshUnitCost();toggleUnitMode();unitsInput.oninput=refreshUnitCost;packageInput.oninput=refreshUnitCost;baseUnitSelect.onchange=refreshUnitCost;conversionToggle.onchange=toggleUnitMode;
 if(!pid){$$('#productForm input[type="number"]').forEach(function(inp){inp.addEventListener('focus',function(){if(inp.value==='0')inp.value=''})})}
 $('#quickAddCategory').onclick=function(){const box=$('#quickCategoryBox');box.classList.toggle('hidden');if(!box.classList.contains('hidden'))setTimeout(function(){$('#quickCategoryName').focus()},20)};
 $('#saveQuickCategory').onclick=function(){const name=String($('#quickCategoryName').value||'').trim();if(!name){toast('نام دسته را وارد کنید');return}if(db.categories.some(function(c){return normalizeText(c.name)===normalizeText(name)})){toast('این دسته قبلاً وجود دارد');return}const c={id:id('cat'),name:name};db.categories.push(c);const sel=$('#productCategorySelect');sel.insertAdjacentHTML('beforeend','<option value="'+c.id+'">'+esc(c.name)+'</option>');sel.value=c.id;$('#quickCategoryName').value='';$('#quickCategoryBox').classList.add('hidden');persistState(db);toast('دسته ایجاد شد')};
 $('#imageUploader').onclick=function(e){if(e.target!==fileInput&&e.target.tagName!=='BUTTON')fileInput.click()};fileInput.onchange=async function(e){const f=e.target.files[0];if(!f)return;try{imageData=await resizeImage(f);renderPreview();toast('عکس کالا آماده شد')}catch(err){toast('فایل تصویر معتبر نیست')}};$('#removeProductImage').onclick=function(e){e.stopPropagation();imageData='';fileInput.value='';renderPreview()};$('#addBarcode').onclick=function(){const list=$$('#barcodeList .barcode-row');if(list.length>=15){toast('حداکثر 15 بارکد برای هر کالا');return}$('#barcodeList').insertAdjacentHTML('beforeend',barcodeRowsHtml(['']));refreshBarcodeRows();const inputs=$$('.barcode-entry');inputs[inputs.length-1].focus()};$('#cancelProduct').onclick=closeModal;
 $('#productForm').onsubmit=function(e){e.preventDefault();const f=new FormData(e.target),barcodes=$$('.barcode-entry').map(function(x){return x.value.trim()}).filter(Boolean).filter(function(x,i,a){return a.indexOf(x)===i});if(!barcodes.length){toast('حداقل یک بارکد وارد کنید');return}if(barcodes.length>15){toast('حداکثر 15 بارکد مجاز است');return}let conflict=null;db.products.forEach(function(prod){if(prod.id===(pid||''))return;(prod.barcodes||[]).forEach(function(code){if(barcodes.indexOf(code)>-1)conflict=code})});if(conflict){toast('بارکد '+conflict+' قبلاً ثبت شده');return}const enabled=conversionToggle.checked,baseUnit=enabled?String(f.get('baseUnit')||'دانه'):String(f.get('simpleBaseUnit')||'دانه'),units=enabled?Math.max(1,+f.get('unitsPerPurchase')||1):1,purchaseUnit=enabled?String(f.get('purchaseUnit')||'بسته'):baseUnit,packCost=enabled?Math.max(0,+f.get('packageBuyPrice')||0):Math.max(0,+f.get('simpleBuyPrice')||0),unitCost=enabled?packCost/units:packCost,obj={id:pid||id('p'),name:String(f.get('name')||'').trim(),producer:String(f.get('producer')||'').trim(),categoryId:String(f.get('categoryId')||'cat-general'),barcodes:barcodes,barcode:barcodes[0],image:imageData,unitConversionEnabled:enabled,baseUnit:baseUnit,purchaseUnit:purchaseUnit,unitsPerPurchase:units,packageBuyPrice:packCost,buy:unitCost,sell:+f.get('sell')||0,stock:+f.get('stock')||0,min:+f.get('min')||0,variablePrice:false,costUnknown:false};if(!obj.name){toast('نام کالا را وارد کنید');return}if(pid){const old=db.products.find(function(x){return x.id===pid}),delta=obj.stock-old.stock;if(delta)db.inventory.push({id:id('inv'),time:new Date().toISOString(),productId:pid,productName:obj.name,type:'اصلاح موجودی',qty:delta,ref:'ویرایش کالا'});Object.assign(old,obj)}else{db.products.push(obj);if(obj.stock)db.inventory.push({id:id('inv'),time:new Date().toISOString(),productId:obj.id,productName:obj.name,type:'موجودی اولیه',qty:obj.stock,ref:'ثبت کالا'})}if(save()){closeModal();toast('کالا ذخیره شد')}};
}

function openPurchase(pid){
 const p=db.products.find(function(x){return x.id===pid});if(!p)return;const enabled=!!p.unitConversionEnabled,units=Math.max(1,Number(p.unitsPerPurchase)||1),supplierOptions='<option value="">بدون شرکت</option>'+db.suppliers.map(function(x){return '<option value="'+x.id+'">'+esc(x.name)+'</option>'}).join(''),modeOptions=enabled?'<option value="package">'+esc(p.purchaseUnit)+' ('+num(units)+' '+esc(p.baseUnit)+')</option><option value="unit">'+esc(p.baseUnit)+' / واحد</option>':'<option value="unit">'+esc(p.baseUnit)+' / واحد</option>';
 openModal('ثبت خرید · '+p.name,'<form id="purchaseForm" class="modal-form purchase-form"><div class="purchase-product-head">'+productImageHtml(p,'product-thumb')+'<div><b>'+esc(p.name)+'</b><small>'+(enabled?num(units)+' '+esc(p.baseUnit)+' در هر '+esc(p.purchaseUnit):'خرید مستقیم به '+esc(p.baseUnit))+'</small></div></div><div class="form-grid"><label class="field"><span>شیوه ثبت خرید</span><select id="purchaseMode" name="mode">'+modeOptions+'</select></label><label class="field"><span id="purchaseQtyLabel">تعداد</span><input id="purchaseQty" name="qty" type="number" min="0.01" step="any" value="1" required></label><label class="field"><span id="purchaseCostLabel">قیمت خرید</span><div class="input-with-suffix"><input id="purchaseCost" name="cost" type="number" min="0" step="any" value="'+Number(enabled?p.packageBuyPrice:p.buy||0)+'" required><span>؋</span></div></label><label class="field"><span>شرکت / تأمین‌کننده</span><select name="supplierId">'+supplierOptions+'</select></label><label class="field"><span>پرداخت خرید</span><select name="payment"><option>نقدی</option><option>قرض</option></select></label></div><div id="purchasePreview" class="purchase-preview"></div><div class="modal-actions"><button type="button" class="ghost-btn" id="cancelPurchase">انصراف</button><button class="primary-btn">ثبت خرید و افزایش موجودی</button></div></form>');
 function values(){const mode=$('#purchaseMode').value,qty=Math.max(0,Number($('#purchaseQty').value)||0),cost=Math.max(0,Number($('#purchaseCost').value)||0),isPack=mode==='package'&&enabled,incoming=isPack?qty*units:qty,unitCost=isPack?(units?cost/units:0):cost,total=qty*cost;return {mode:mode,qty:qty,cost:cost,isPack:isPack,incoming:incoming,unitCost:unitCost,total:total}}
 function updateLabels(){const v=values();$('#purchaseQtyLabel').textContent=v.isPack?'تعداد '+p.purchaseUnit:'تعداد '+p.baseUnit;$('#purchaseCostLabel').textContent=v.isPack?'قیمت هر '+p.purchaseUnit:'قیمت هر '+p.baseUnit;if(v.isPack&&(!$('#purchaseCost').dataset.touched))$('#purchaseCost').value=Number(p.packageBuyPrice||0);if(!v.isPack&&(!$('#purchaseCost').dataset.touched))$('#purchaseCost').value=Number(p.buy||0)}
 function preview(){const v=values(),oldStock=Math.max(0,Number(p.stock)||0),oldCost=Number(p.buy)||0,newAvg=(oldStock+v.incoming)>0?((oldStock*oldCost)+(v.incoming*v.unitCost))/(oldStock+v.incoming):v.unitCost;$('#purchasePreview').innerHTML='<div><span>ورود به موجودی</span><b>+'+amount(v.incoming)+' '+esc(p.baseUnit)+'</b></div><div><span>بهای این خرید / '+esc(p.baseUnit)+'</span><b>'+money(v.unitCost)+'</b></div><div><span>بهای متوسط جدید</span><b>'+money(newAvg)+'</b></div><div class="total"><span>جمع خرید</span><b>'+money(v.total)+'</b></div>'}
 $('#purchaseMode').onchange=function(){$('#purchaseCost').dataset.touched='';updateLabels();preview()};$('#purchaseQty').oninput=preview;$('#purchaseCost').oninput=function(){this.dataset.touched='1';preview()};$('#cancelPurchase').onclick=closeModal;updateLabels();preview();
 $('#purchaseForm').onsubmit=function(e){e.preventDefault();const f=new FormData(e.target),v=values();if(!v.qty||!v.incoming){toast('تعداد خرید معتبر نیست');return}const oldStock=Math.max(0,Number(p.stock)||0),oldCost=Number(p.buy)||0,newAvg=(oldStock+v.incoming)>0?((oldStock*oldCost)+(v.incoming*v.unitCost))/(oldStock+v.incoming):v.unitCost,supplierId=String(f.get('supplierId')||''),payment=String(f.get('payment')||'نقدی'),time=new Date().toISOString();if(payment==='قرض'&&!supplierId){toast('برای خرید قرض، شرکت تأمین‌کننده را انتخاب کنید');return}p.stock=oldStock+v.incoming;p.buy=newAvg;if(v.isPack)p.packageBuyPrice=v.cost;db.purchases.push({id:id('pur'),time:time,productId:p.id,productName:p.name,mode:v.mode,quantity:v.qty,packs:v.isPack?v.qty:0,purchaseUnit:v.isPack?p.purchaseUnit:p.baseUnit,unitsPerPurchase:v.isPack?units:1,units:v.incoming,packCost:v.isPack?v.cost:0,unitCost:v.unitCost,avgCost:newAvg,total:v.total,payment:payment,supplierId:supplierId});db.inventory.push({id:id('inv'),time:time,productId:p.id,productName:p.name,type:'خرید',qty:v.incoming,ref:amount(v.qty)+' '+(v.isPack?p.purchaseUnit:p.baseUnit)});if(payment==='قرض'&&supplierId){const sp=db.suppliers.find(function(x){return x.id===supplierId});if(sp)sp.balance=(Number(sp.balance)||0)+v.total}if(save()){closeModal();toast('خرید ثبت شد · +'+amount(v.incoming)+' '+p.baseUnit)}};
}
if($('#inventorySearch'))$('#inventorySearch').oninput=renderInventory;if($('#inventoryStatusFilter'))$('#inventoryStatusFilter').onchange=renderInventory;if($('#adjustInventoryBtn'))$('#adjustInventoryBtn').onclick=function(){const opts=db.products.map(function(p){return '<option value="'+p.id+'">'+esc(p.name)+'</option>'}).join('');if(!opts){toast('ابتدا کالا ثبت کنید');return}openModal('اصلاح موجودی','<form id="inventoryAdjustForm" class="modal-form"><label class="field"><span>کالا</span><select name="productId">'+opts+'</select></label><label class="field"><span>موجودی واقعی</span><input name="stock" type="number" min="0" required></label><label class="field"><span>دلیل اصلاح</span><input name="reason" placeholder="مثلاً انبارگردانی"></label><div class="modal-actions"><button class="primary-btn">ثبت اصلاح</button></div></form>');$('#inventoryAdjustForm').onsubmit=function(e){e.preventDefault();const f=new FormData(e.target),p=db.products.find(function(x){return x.id===f.get('productId')});if(!p)return;const next=Math.max(0,Number(f.get('stock'))||0),delta=next-(Number(p.stock)||0);p.stock=next;if(delta)db.inventory.push({id:id('inv'),time:new Date().toISOString(),productId:p.id,productName:p.name,type:'اصلاح موجودی',qty:delta,ref:String(f.get('reason')||'انبارگردانی')});save();closeModal();toast('موجودی اصلاح شد')} };
$('#addProductBtn').onclick=function(){openProduct()};$('#productSearch').oninput=renderProducts;$('#productFilter').onchange=renderProducts;$('#categoryFilter').onchange=renderProducts;

function openCategoryManager(){
 openModal('مدیریت دسته‌بندی‌ها','<form id="categoryForm" class="modal-form"><label class="field"><span>دسته‌بندی جدید</span><div class="category-add-row"><input name="name" placeholder="مثلاً لبنیات" required><button class="primary-btn">افزودن</button></div></label><div class="category-manager-note">برای جابه‌جایی از فلش‌ها استفاده کنید؛ ترتیب در فیلترها و فرم کالا حفظ می‌شود.</div><div id="categoryChipList" class="category-manager-list"></div></form>');
 function redraw(){const box=$('#categoryChipList');box.innerHTML=db.categories.map(function(c,i){const used=db.products.filter(function(p){return p.categoryId===c.id}).length;return '<div class="category-manage-row"><span class="category-drag-index">'+num(i+1)+'</span><input class="category-edit-input" data-edit-cat="'+c.id+'" value="'+esc(c.name)+'" '+(c.id==='cat-general'?'disabled':'')+'><small>'+num(used)+' کالا</small><div class="category-order-actions">'+(i>1|| (i>0&&c.id!=='cat-general')?'<button type="button" class="tiny-btn cat-up" data-id="'+c.id+'">↑</button>':'')+(i<db.categories.length-1&&c.id!=='cat-general'?'<button type="button" class="tiny-btn cat-down" data-id="'+c.id+'">↓</button>':'')+(c.id!=='cat-general'?'<button type="button" class="tiny-btn danger cat-delete" data-id="'+c.id+'">حذف</button>':'')+'</div></div>'}).join('');
  $$('.category-edit-input:not([disabled])').forEach(function(inp){inp.onchange=function(){const c=db.categories.find(function(x){return x.id===inp.dataset.editCat}),name=inp.value.trim();if(!c||!name){redraw();return}if(db.categories.some(function(x){return x.id!==c.id&&normalizeText(x.name)===normalizeText(name)})){toast('این نام دسته قبلاً وجود دارد');redraw();return}c.name=name;save();toast('نام دسته ویرایش شد')}});
  $$('.cat-up,.cat-down').forEach(function(b){b.onclick=function(){const idx=db.categories.findIndex(function(x){return x.id===b.dataset.id});if(idx<1)return;const ni=b.classList.contains('cat-up')?idx-1:idx+1;if(ni<1||ni>=db.categories.length)return;const t=db.categories[idx];db.categories[idx]=db.categories[ni];db.categories[ni]=t;save();redraw()}});
  $$('.cat-delete').forEach(function(b){b.onclick=function(){const cid=b.dataset.id,cat=db.categories.find(function(c){return c.id===cid}),usedCount=db.products.filter(function(p){return p.categoryId===cid}).length;if(!cat)return;if(!confirm('دسته «'+cat.name+'» حذف شود؟'+(usedCount?' '+num(usedCount)+' کالا به دسته عمومی منتقل می‌شود.':'')))return;db.products.forEach(function(p){if(p.categoryId===cid)p.categoryId='cat-general'});db.categories=db.categories.filter(function(c){return c.id!==cid});save();redraw();toast('دسته حذف شد')}})
 }
 redraw();$('#categoryForm').onsubmit=function(e){e.preventDefault();const f=new FormData(e.target),name=String(f.get('name')||'').trim();if(!name)return;if(db.categories.some(function(c){return normalizeText(c.name)===normalizeText(name)})){toast('این دسته‌بندی قبلاً وجود دارد');return}db.categories.push({id:id('cat'),name:name});save();e.target.reset();redraw()}
}
$('#manageCategoriesBtn').onclick=openCategoryManager;

$('#addCustomerBtn').onclick=function(){openModal('مشتری جدید','<form id="customerForm" class="modal-form"><label class="field"><span>نام مشتری</span><input name="name" required></label><label class="field"><span>شماره تماس</span><input name="phone"></label><label class="field"><span>قرضه اولیه</span><input name="balance" type="number" min="0" value="0"></label><div class="modal-actions"><button class="primary-btn">ذخیره</button></div></form>');$('#customerForm').onsubmit=function(e){e.preventDefault();let f=new FormData(e.target);db.customers.push({id:id('c'),name:String(f.get('name')||'').trim(),phone:String(f.get('phone')||''),balance:+f.get('balance')||0});save();closeModal()}};
$('#addSupplierBtn').onclick=function(){openModal('شرکت / تأمین‌کننده جدید','<form id="supplierForm" class="modal-form"><label class="field"><span>نام شرکت</span><input name="name" required></label><label class="field"><span>شماره تماس</span><input name="phone"></label><label class="field"><span>قرض فعلی به شرکت</span><input name="balance" type="number" min="0" value="0"></label><div class="modal-actions"><button class="primary-btn">ذخیره</button></div></form>');$('#supplierForm').onsubmit=function(e){e.preventDefault();let f=new FormData(e.target);db.suppliers.push({id:id('sp'),name:String(f.get('name')||'').trim(),phone:String(f.get('phone')||''),balance:+f.get('balance')||0});save();closeModal()}};
function openCustomerReceipt(cid){const c=db.customers.find(function(x){return x.id===cid});if(!c)return;openModal('دریافت قرض مشتری','<form id="customerReceiptForm" class="modal-form"><div class="summary-item"><span>'+esc(c.name)+'</span><b>'+money(c.balance||0)+'</b></div><label class="field"><span>مبلغ دریافت</span><input name="amount" type="number" min="1" max="'+Number(c.balance||0)+'" required></label><label class="field"><span>یادداشت</span><input name="note"></label><div class="modal-actions"><button class="primary-btn">ثبت دریافت</button></div></form>');$('#customerReceiptForm').onsubmit=function(e){e.preventDefault();const f=new FormData(e.target),amount=+f.get('amount');if(!amount||amount<=0||amount>c.balance){toast('مبلغ معتبر وارد کنید');return}c.balance-=amount;db.customerReceipts.push({id:id('cr'),time:new Date().toISOString(),customerId:c.id,customerName:c.name,amount:amount,note:String(f.get('note')||'')});save();closeModal();toast('دریافت قرض ثبت شد')}}
function openSupplierPayment(sid){const s=db.suppliers.find(function(x){return x.id===sid});if(!s)return;openModal('پرداخت قرض شرکت','<form id="supplierPaymentForm" class="modal-form"><div class="summary-item"><span>'+esc(s.name)+'</span><b>'+money(s.balance||0)+'</b></div><label class="field"><span>مبلغ پرداخت</span><input name="amount" type="number" min="1" max="'+Number(s.balance||0)+'" required></label><label class="field"><span>یادداشت</span><input name="note"></label><div class="modal-actions"><button class="primary-btn">ثبت پرداخت</button></div></form>');$('#supplierPaymentForm').onsubmit=function(e){e.preventDefault();const f=new FormData(e.target),amount=+f.get('amount');if(!amount||amount<=0||amount>s.balance){toast('مبلغ معتبر وارد کنید');return}s.balance-=amount;db.supplierPayments.push({id:id('spay'),time:new Date().toISOString(),supplierId:s.id,supplierName:s.name,amount:amount,note:String(f.get('note')||'')});save();closeModal();toast('پرداخت قرض شرکت ثبت شد')}}
$('#addExpenseBtn').onclick=function(){openModal('ثبت هزینه','<form id="expenseForm" class="modal-form"><label class="field"><span>نوع هزینه</span><select name="category"><option>کرایه</option><option>برق</option><option>حمل‌ونقل</option><option>معاش</option><option>تعمیرات</option><option>مصارف متفرقه</option></select></label><label class="field"><span>مبلغ</span><input name="amount" type="number" min="1" required></label><label class="field"><span>یادداشت</span><input name="note"></label><div class="modal-actions"><button class="primary-btn">ثبت هزینه</button></div></form>');$('#expenseForm').onsubmit=function(e){e.preventDefault();const f=new FormData(e.target),amount=+f.get('amount');if(!amount||amount<=0){toast('مبلغ معتبر وارد کنید');return}db.expenses.push({id:id('ex'),time:new Date().toISOString(),category:String(f.get('category')||'هزینه'),amount:amount,note:String(f.get('note')||'')});save();closeModal();toast('هزینه ثبت شد')}};

function normalizedServerUrl(value){return String(value||'').trim().replace(/\/+$/,'')}
function renderOnlineSettings(){
 const s=db.settings,enabled=!!s.onlineEnabled,fields=$('#onlineFields'),pill=$('#onlineStatusPill'),status=$('#onlineStatusText');
 $('#onlineEnabled').checked=enabled;$('#onlineServerUrl').value=s.onlineServerUrl||'';$('#onlineStoreCode').value=s.onlineStoreCode||'';$('#onlineSyncMinutes').value=String(s.onlineSyncMinutes||15);$('#onlineSyncSales').checked=s.onlineSyncSales!==false;$('#onlineSyncInventory').checked=s.onlineSyncInventory!==false;
 fields.classList.toggle('is-disabled',!enabled);fields.querySelectorAll('input,select,button').forEach(function(el){if(el.id!=='onlineEnabled')el.disabled=!enabled});
 let label='محلی',cls='pill',text='وضعیت: حالت محلی';
 if(enabled){label='آماده';cls='pill warning';text='وضعیت: تنظیمات آنلاین فعال است';if(s.onlineLastStatus==='connected'){label='متصل';cls='pill success';text='وضعیت: اتصال سرور تأیید شده'+(s.onlineLastCheckAt?' · '+formatDateTime(s.onlineLastCheckAt):'')}else if(s.onlineLastStatus==='error'){label='خطا';cls='pill danger';text='وضعیت: آخرین بررسی اتصال ناموفق بود'}}
 pill.className=cls;pill.textContent=label;status.textContent=text+(s.onlineLastSyncAt?' · آخرین Sync: '+formatDateTime(s.onlineLastSyncAt):'');
}
async function testOnlineConnection(){
 if(!db.settings.onlineEnabled){toast('ابتدا اتصال آنلاین را فعال کنید');return false}
 const base=normalizedServerUrl(db.settings.onlineServerUrl);if(!base){toast('آدرس سرور را وارد کنید');return false}
 const btn=$('#testOnlineConnection'),old=btn.textContent;btn.disabled=true;btn.textContent='در حال بررسی…';
 try{const controller=new AbortController(),timer=setTimeout(function(){controller.abort()},7000),r=await fetch(base+'/health',{method:'GET',cache:'no-store',signal:controller.signal});clearTimeout(timer);if(!r.ok)throw new Error('HTTP '+r.status);db.settings.onlineLastStatus='connected';db.settings.onlineLastCheckAt=new Date().toISOString();save();toast('اتصال آنلاین برقرار است');return true}catch(e){console.error(e);db.settings.onlineLastStatus='error';db.settings.onlineLastCheckAt=new Date().toISOString();save();toast('اتصال به سرور برقرار نشد');return false}finally{btn.disabled=false;btn.textContent=old;renderOnlineSettings()}
}
async function syncOnlineNow(silent){
 if(!db.settings.onlineEnabled){toast('ابتدا اتصال آنلاین را فعال کنید');return}
 const base=normalizedServerUrl(db.settings.onlineServerUrl),code=String(db.settings.onlineStoreCode||'').trim();if(!base||!code){toast('آدرس سرور و کد فروشگاه را کامل کنید');return}
 const btn=$('#syncOnlineNow'),old=btn.textContent;btn.disabled=true;btn.textContent='در حال همگام‌سازی…';
 try{const payload={app:'hesabdari-asan',version:'2.0',storeCode:code,syncedAt:new Date().toISOString(),sales:db.settings.onlineSyncSales?db.sales:[],customers:db.settings.onlineSyncSales?db.customers:[],products:db.settings.onlineSyncInventory?db.products:[],purchases:db.settings.onlineSyncInventory?db.purchases:[],inventory:db.settings.onlineSyncInventory?db.inventory:[]};const controller=new AbortController(),timer=setTimeout(function(){controller.abort()},12000),r=await fetch(base+'/api/v1/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});clearTimeout(timer);if(!r.ok)throw new Error('HTTP '+r.status);db.settings.onlineLastStatus='connected';db.settings.onlineLastCheckAt=new Date().toISOString();db.settings.onlineLastSyncAt=new Date().toISOString();save();if(!silent)toast('همگام‌سازی انجام شد')}catch(e){console.error(e);db.settings.onlineLastStatus='error';db.settings.onlineLastCheckAt=new Date().toISOString();save();if(!silent)toast('همگام‌سازی انجام نشد؛ تنظیمات سرور را بررسی کنید')}finally{btn.disabled=false;btn.textContent=old;renderOnlineSettings()}
}
$('#onlineEnabled').onchange=function(e){db.settings.onlineEnabled=e.target.checked;if(!e.target.checked)db.settings.onlineLastStatus='local';save();renderOnlineSettings()};
['onlineServerUrl','onlineStoreCode'].forEach(function(k){$('#'+k).onchange=function(e){db.settings[k]=e.target.value.trim();db.settings.onlineLastStatus='ready';save();renderOnlineSettings()}});
$('#onlineSyncMinutes').onchange=function(e){db.settings.onlineSyncMinutes=Number(e.target.value)||15;save()};
['onlineSyncSales','onlineSyncInventory'].forEach(function(k){$('#'+k).onchange=function(e){db.settings[k]=e.target.checked;save()}});
$('#testOnlineConnection').onclick=testOnlineConnection;$('#syncOnlineNow').onclick=function(){syncOnlineNow(false)};
function maybeAutoOnlineSync(){const s=db.settings;if(!s.onlineEnabled||!normalizedServerUrl(s.onlineServerUrl)||!String(s.onlineStoreCode||'').trim())return;const mins=Math.max(5,Number(s.onlineSyncMinutes)||15),last=s.onlineLastSyncAt?new Date(s.onlineLastSyncAt).getTime():0;if(!last||Date.now()-last>=mins*60000)syncOnlineNow(true)}
setInterval(maybeAutoOnlineSync,60000);setTimeout(maybeAutoOnlineSync,5000);

$('#unlockDataSupport').onclick=async function(){const password=$('#dataSupportPassword').value;const valid=(window.YaranNative&&window.YaranNative.isNative)?await window.YaranNative.verifyAdmin(password):(password===DATA_SUPPORT_PASSWORD);if(valid){dataSupportUnlocked=true;$('#dataSupportPassword').value='';renderDataSupportAccess();toast('بخش داده‌ها و پشتیبانی باز شد')}else{toast('رمز مدیر نادرست است')}};
$('#dataSupportPassword').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('#unlockDataSupport').click()}});
$('#lockDataSupport').onclick=function(){dataSupportUnlocked=false;renderDataSupportAccess();toast('بخش داده‌ها و پشتیبانی قفل شد')};
if($('#auditLogBtn'))$('#auditLogBtn').onclick=openAuditLog;
if($('#detectPrinters'))$('#detectPrinters').onclick=async function(){
 if(!(window.YaranNative&&window.YaranNative.isNative)){toast('شناسایی پرینتر در نسخه Native فعال است');return}
 try{const list=await window.YaranNative.printers();const dl=$('#printerList');dl.innerHTML=(list||[]).map(function(n){return '<option value="'+esc(n)+'"></option>'}).join('');if(!list.length){toast('پرینتری در Windows پیدا نشد');return}const current=String(db.settings.printerName||'').trim(),match=list.find(function(n){return n===current})||list.find(function(n){return /xprinter/i.test(n)})||list[0];if(!list.some(function(n){return n===current})){db.settings.printerName=match;$('#printerName').value=match;save()}toast(num(list.length)+' پرینتر شناسایی شد')}catch(e){console.error(e);toast('شناسایی پرینتر انجام نشد')}
};
if($('#dbHealthBtn'))$('#dbHealthBtn').onclick=async function(){
 if(!(window.YaranNative&&window.YaranNative.isNative&&window.YaranNative.integrityCheck)){toast('بررسی دیتابیس در نسخه Native فعال است');return}
 try{const r=await window.YaranNative.integrityCheck();toast(r&&r.ok?'دیتابیس SQLite سالم است':'دیتابیس نیاز به بررسی دارد');if(r&&!r.ok)console.error('SQLite integrity:',r)}catch(e){console.error(e);toast('بررسی سلامت دیتابیس انجام نشد')}
};
['storeName','storeAddress','storePhone','receiptFooter','printerName'].forEach(function(k){$('#'+k).onchange=function(e){db.settings[k]=e.target.value;save()}});['autoPrint','autoCut'].forEach(function(k){$('#'+k).onchange=function(e){db.settings[k]=e.target.checked;save()}});$('#themeSelect').onchange=function(e){db.settings.theme=e.target.value;save()};$('#scannerSuffix').onchange=function(e){db.settings.scannerSuffix=e.target.value;save()};$('#autoBackupPerDay').onchange=function(e){db.settings.autoBackupPerDay=Number(e.target.value)||0;save();maybeAutoBackup(true)};$('#themeToggle').onclick=function(){db.settings.theme=db.settings.theme==='dark'?'light':'dark';save()};$('#moneyToggle').onclick=function(){moneyVisible=!moneyVisible;db.settings.hideDashboardMoney=!moneyVisible;persistState(db);renderDashboard()};$('#reportPeriod').onchange=renderReports;if($('#invoiceReportSearch'))$('#invoiceReportSearch').oninput=renderReports;if($('#invoicePaymentFilter'))$('#invoicePaymentFilter').onchange=renderReports;
function openPeriodRestartNotice(){
 const fp=db.financialPeriod,months=financialPeriodMonths();
 openModal('شروع دوره حسابی جدید','<div class="confirm-card period-confirm"><div class="confirm-icon period">↻</div><h4>از سرگیری دوره حسابی</h4><p>'+accountingPeriodName(fp.no)+' در '+accountingMonthName()+' قرار دارد. با تأیید، این دوره تا همین لحظه بسته می‌شود و خلاصه آن ذخیره خواهد شد؛ فروش‌ها و فاکتورها حذف نمی‌شوند.</p><div class="confirm-summary"><span>شروع دوره فعلی</span><b>'+formatDate(fp.start)+'</b></div><div class="confirm-summary"><span>مدت فعلی</span><b>'+accountingMonthName()+'</b></div><div class="notice-strip">شروع دوره جدید در هر زمان مجاز است. این عمل تاریخ شروع گزارش‌های «دوره جاری» را از امروز تنظیم می‌کند.</div><div class="modal-actions"><button id="cancelNewPeriod" class="ghost-btn">انصراف</button><button id="confirmNewPeriod" class="primary-btn">تأیید و شروع دوره جدید</button></div></div>');
 $('#cancelNewPeriod').onclick=closeModal;$('#confirmNewPeriod').onclick=function(){const period='financial',sales=periodSales(period),snapshot={sales:sales.reduce(function(a,s){return a+s.total},0),netProfit:netProfitPeriod(period),cashFlow:netCash(period),customerDebt:customerDebt(),supplierDebt:supplierDebt(),months:months};db.financialPeriods.push({no:db.financialPeriod.no,start:db.financialPeriod.start,end:new Date().toISOString(),closedAt:new Date().toISOString(),summary:snapshot});db.financialPeriod={no:Number(db.financialPeriod.no||1)+1,start:new Date().toISOString()};save();closeModal();toast(accountingPeriodName(db.financialPeriod.no)+' آغاز شد')}
}
$('#startNewPeriodBtn').onclick=openPeriodRestartNotice;

function auditActionLabel(action){if(action==='invoice.create')return 'ثبت فاکتور';if(action==='invoice.update')return 'ویرایش فاکتور';if(action==='invoice.delete')return 'حذف فاکتور';return action||'رویداد'}
async function openAuditLog(){
 if(!(window.YaranNative&&window.YaranNative.isNative&&window.YaranNative.auditLog)){toast('سابقه امن در نسخه Native در دسترس است');return}
 openModal('سابقه تغییرات فاکتورها','<div class="audit-loading">در حال خواندن سابقه امن SQLite…</div>');
 try{
  const rows=await window.YaranNative.auditLog(60);
  const html=!rows.length?'<div class="audit-empty">هنوز فعالیتی ثبت نشده است.</div>':'<div class="activity-feed">'+rows.map(function(r){const p=r.payload||{},before=p.before||null,after=p.after||null;let detail=p.summary||'ثبت امن تغییر';if(r.action==='invoice.update'&&before&&after){const parts=[];if(Number(before.total)!==Number(after.total))parts.push('مبلغ '+money(before.total||0)+' → '+money(after.total||0));if(before.payment!==after.payment)parts.push('پرداخت '+before.payment+' → '+after.payment);const bq=(before.items||[]).reduce(function(a,i){return a+i.qty},0),aq=(after.items||[]).reduce(function(a,i){return a+i.qty},0);if(bq!==aq)parts.push('اقلام '+num(bq)+' → '+num(aq));detail=parts.join(' · ')||'اطلاعات فاکتور ویرایش شد'}if(r.action==='invoice.delete')detail='فاکتور حذف شد؛ نسخه قبلی محفوظ است';const icon=r.action==='invoice.create'?'＋':r.action==='invoice.delete'?'×':'✎';return '<div class="activity-item '+(r.action==='invoice.delete'?'danger':'')+'"><div class="activity-avatar">'+icon+'</div><div class="activity-bubble"><div><b>'+auditActionLabel(r.action)+'</b>'+(r.invoiceNo!=null?'<span>#'+num(r.invoiceNo)+'</span>':'')+'</div><p>'+esc(detail)+'</p><small>'+formatDateTime(r.createdAt)+'</small></div></div>'}).join('')+'</div>';
  $('#modalContent').innerHTML=html;
 }catch(e){console.error(e);$('#modalContent').innerHTML='<div class="audit-empty">خواندن سابقه تغییرات انجام نشد.</div>'}
}

function receiptHtml(sale){const set=db.settings;return '<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:2mm}body{width:72mm;margin:0 auto;font-family:"Segoe UI",Tahoma,Arial,sans-serif;font-size:11px;color:#000}.c{text-align:center}.h{font-size:17px;font-weight:700;margin:4px 0}.line{border-top:1px dashed #000;margin:7px 0}.row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.items{width:100%;border-collapse:collapse}.items th,.items td{font-size:10px;padding:3px 0;text-align:right}.items td:last-child,.items th:last-child{text-align:left}.total{font-size:14px;font-weight:bold}.foot{margin-top:10px;text-align:center}</style></head><body>'+(set.storeLogo?'<div class="c"><img src="'+esc(set.storeLogo)+'" style="width:46px;height:46px;object-fit:contain;margin:2px auto 4px"></div>':'')+'<div class="c h">'+esc(set.storeName)+'</div>'+(set.storeAddress?'<div class="c">'+esc(set.storeAddress)+'</div>':'')+(set.storePhone?'<div class="c">'+esc(set.storePhone)+'</div>':'')+'<div class="line"></div><div class="row"><span>فاکتور #'+num(sale.no)+'</span><span>'+formatDateTime(sale.time)+'</span></div><div class="line"></div><table class="items"><thead><tr><th>کالا</th><th>تعداد</th><th>مبلغ</th></tr></thead><tbody>'+sale.items.map(function(i){return '<tr><td>'+esc(i.name)+'</td><td>'+num(i.qty)+' '+esc(i.baseUnit||'دانه')+'</td><td>'+num(i.sell*i.qty)+' ؋</td></tr>'}).join('')+'</tbody></table><div class="line"></div><div class="row"><span>جمع</span><b>'+money(sale.subtotal)+'</b></div>'+(sale.discount?'<div class="row"><span>تخفیف</span><b>'+money(sale.discount)+'</b></div>':'')+'<div class="row total"><span>قابل پرداخت</span><span>'+money(sale.total)+'</span></div><div class="row"><span>پرداخت</span><span>'+esc(sale.payment)+'</span></div><div class="line"></div><div class="foot">'+esc(set.receiptFooter||'')+'</div><script>onload=function(){print()}<\/script></body></html>'}
function loadReceiptImage(src){return new Promise(function(resolve,reject){if(!src){resolve(null);return}const im=new Image();im.onload=function(){resolve(im)};im.onerror=reject;im.src=src})}
function fitCanvasText(ctx,text,maxWidth){text=String(text||'');if(ctx.measureText(text).width<=maxWidth)return text;let out=text;while(out.length>1&&ctx.measureText(out+'…').width>maxWidth)out=out.slice(0,-1);return out+'…'}
async function receiptPngBase64(sale){
 const set=db.settings,W=576,itemH=52,logoExtra=set.storeLogo?92:0,H=470+logoExtra+(sale.items||[]).length*itemH+(sale.discount?34:0);const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,W,H);x.fillStyle='#000';x.textBaseline='middle';x.direction='rtl';let y=24;
 if(set.storeLogo){try{const logo=await loadReceiptImage(set.storeLogo);if(logo){const size=72;x.drawImage(logo,(W-size)/2,y,size,size);y+=84}}catch(e){}}
 x.textAlign='center';x.font='700 31px "Segoe UI", Tahoma, Arial';x.fillText(set.storeName||'فروشگاه من',W/2,y);y+=39;
 x.font='18px "Segoe UI", Tahoma, Arial';if(set.storeAddress){x.fillText(fitCanvasText(x,set.storeAddress,W-50),W/2,y);y+=27}if(set.storePhone){x.direction='ltr';x.fillText(String(set.storePhone),W/2,y);x.direction='rtl';y+=27}
 function dash(){y+=9;x.save();x.setLineDash([8,7]);x.strokeStyle='#222';x.lineWidth=1;x.beginPath();x.moveTo(22,y);x.lineTo(W-22,y);x.stroke();x.restore();y+=14}
 dash();x.font='18px "Segoe UI", Tahoma, Arial';x.textAlign='right';x.fillText('فاکتور #'+num(sale.no),W-24,y);x.textAlign='left';x.direction='ltr';x.fillText(formatDateTime(sale.time),24,y);x.direction='rtl';y+=26;dash();
 x.font='700 17px "Segoe UI", Tahoma, Arial';x.textAlign='right';x.fillText('کالا',W-24,y);x.textAlign='center';x.fillText('تعداد',180,y);x.textAlign='left';x.fillText('مبلغ',24,y);y+=28;
 (sale.items||[]).forEach(function(i){x.font='19px "Segoe UI", Tahoma, Arial';x.textAlign='right';x.fillText(fitCanvasText(x,i.name,310),W-24,y);x.textAlign='center';x.direction='rtl';x.fillText(num(i.qty)+' '+String(i.baseUnit||'دانه'),180,y);x.textAlign='left';x.direction='ltr';x.fillText(amount((Number(i.sell)||0)*(Number(i.qty)||0))+' ؋',24,y);x.direction='rtl';y+=itemH});
 dash();function summary(label,val,bold){x.font=(bold?'700 24px':'19px')+' "Segoe UI", Tahoma, Arial';x.textAlign='right';x.fillText(label,W-24,y);x.textAlign='left';x.direction='ltr';x.fillText(val,24,y);x.direction='rtl';y+=bold?36:31}
 summary('جمع',money(sale.subtotal),false);if(sale.discount)summary('تخفیف',money(sale.discount),false);summary('قابل پرداخت',money(sale.total),true);summary('پرداخت',String(sale.payment||'نقدی'),false);dash();x.font='18px "Segoe UI", Tahoma, Arial';x.textAlign='center';x.fillText(fitCanvasText(x,set.receiptFooter||'',W-50),W/2,y);return c.toDataURL('image/png').split(',')[1]
}
async function printReceipt(s){
 s=s||lastSale||(db.sales.length?db.sales[db.sales.length-1]:null);if(!s){toast('رسیدی برای چاپ وجود ندارد');return}
 if(window.YaranNative&&window.YaranNative.isNative&&window.YaranNative.printReceiptPng&&String(db.settings.printerName||'').trim()){
  try{const png=await receiptPngBase64(s);await window.YaranNative.printReceiptPng(db.settings.printerName,png);toast('رسید مستقیم چاپ شد');return}catch(e){console.error('Direct print failed:',e);toast('چاپ مستقیم انجام نشد؛ حالت چاپ ویندوز باز می‌شود')}
 }
 const f=$('#printFrame'),d=f.contentWindow.document;d.open();d.write(receiptHtml(s));d.close()
}
$('#testPrint').onclick=function(){printReceipt({no:'TEST',time:new Date().toISOString(),items:[{name:'چاپ آزمایشی حسابداری آسان',qty:1,sell:100,buy:80,baseUnit:'دانه'}],subtotal:100,discount:0,total:100,payment:'نقدی'})};$('#printLastReceipt').onclick=function(){printReceipt()};
function getLatestAutoBackup(){
 if(window.YaranNative&&window.YaranNative.isNative)return db.settings.lastAutoBackupAt?{time:db.settings.lastAutoBackupAt}:null;
 try{return JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY)||'null')}catch(e){return null}
}
async function createAutoBackup(showToast){
 try{
  const now=new Date().toISOString();
  if(window.YaranNative&&window.YaranNative.isNative){const path=await window.YaranNative.backup(JSON.stringify(db));if(!path)throw new Error('backup failed');db.settings.lastAutoBackupAt=now;persistState(db)}
  else localStorage.setItem(AUTO_BACKUP_KEY,JSON.stringify({time:now,data:db}));
  renderAutoBackupStatus();if(showToast)toast('پشتیبان خودکار ثبت شد');return true
 }catch(e){console.error(e);if(showToast)toast('ثبت پشتیبان انجام نشد');return false}
}
function maybeAutoBackup(force){const per=Number(db.settings.autoBackupPerDay)||0;if(!per){renderAutoBackupStatus();return}const latest=getLatestAutoBackup(),interval=86400000/per;if(force||!latest||!latest.time||Date.now()-new Date(latest.time).getTime()>=interval)createAutoBackup(false)}
$('#restoreAutoBackup').onclick=async function(){
 if(!confirm('آخرین پشتیبان خودکار بازیابی شود؟ اطلاعات فعلی با نسخه پشتیبان جایگزین می‌شود.'))return;
 if(window.YaranNative&&window.YaranNative.isNative&&window.YaranNative.restoreLatestBackup){try{const ok=await window.YaranNative.restoreLatestBackup();if(!ok){toast('پشتیبان Native وجود ندارد');return}toast('پشتیبان بازیابی شد؛ حسابداری آسان دوباره بارگذاری می‌شود');setTimeout(function(){location.reload()},700)}catch(e){console.error(e);toast('بازیابی پشتیبان انجام نشد')}return}
 const x=getLatestAutoBackup();if(!x||!x.data){toast('پشتیبان خودکاری وجود ندارد');return}db=normalizeDB(clone(x.data));moneyVisible=!db.settings.hideDashboardMoney;save();toast('پشتیبان خودکار بازیابی شد')
};
$('#storeLogoInput').onchange=async function(e){const f=e.target.files[0];if(!f)return;try{db.settings.storeLogo=await resizeImage(f);save();toast('لوگو ذخیره شد')}catch(err){toast('فایل لوگو معتبر نیست')}};
$('#removeStoreLogo').onclick=function(){db.settings.storeLogo='';$('#storeLogoInput').value='';save()};
$('#backupBtn').onclick=async function(){try{if(window.YaranNative&&window.YaranNative.isNative&&window.YaranNative.exportBackup){const path=await window.YaranNative.exportBackup(JSON.stringify(db));toast(path?'Backup در Downloads ذخیره شد':'ذخیره Backup انجام نشد');return}const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hesabdari-asan-backup-'+dateKey()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},500)}catch(e){console.error(e);toast('ذخیره Backup انجام نشد')}};
$('#restoreFile').onchange=async function(e){const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!x.products||!x.settings)throw new Error('bad');db=normalizeDB(x);moneyVisible=!db.settings.hideDashboardMoney;save();toast('Backup بازیابی شد')}catch(err){toast('فایل Backup معتبر نیست')}};
function buildTrainingDemo(){
 const now=new Date(),D=clone(DEFAULT),start=new Date(now);start.setMonth(start.getMonth()-2);start.setDate(start.getDate()-10);start.setHours(8,0,0,0);
 D.settings=Object.assign({},db.settings,{storeName:'فروشگاه آموزشی حسابداری آسان',storeAddress:'نسخه آموزشی کامل · ۲ ماه و ۱۰ روز',storePhone:'0700000000',demoMode:true,workDayDate:dateKey(),workDayStartedAt:new Date(now.getFullYear(),now.getMonth(),now.getDate(),8,10).toISOString()});
 D.categories=[
  {id:'cat-general',name:'عمومی'},{id:'cat-food',name:'خوراکی و نوشیدنی'},{id:'cat-dairy',name:'لبنیات'},{id:'cat-stationery',name:'قرطاسیه'},
  {id:'cat-home',name:'لوازم خانه'},{id:'cat-hygiene',name:'بهداشتی'},{id:'cat-sewing',name:'خیاطی'},{id:'cat-snacks',name:'تنقلات'}
 ];
 const P=function(idv,name,cat,producer,barcode,buy,sell,stock,min,base,purchase,units){
  return {id:idv,name:name,categoryId:cat,producer:producer,barcodes:[barcode],barcode:barcode,baseUnit:base||'دانه',purchaseUnit:purchase||base||'دانه',unitConversionEnabled:(units||1)>1,unitsPerPurchase:units||1,packageBuyPrice:buy*(units||1),buy:buy,sell:sell,stock:stock,min:min,image:''}
 };
 D.products=[
  P('p1','شیر 1 لیتر','cat-dairy','لبنیات پامیر','6291000000001',45,62,0,12,'دانه','کارتن',12),
  P('p2','ماست 500 گرم','cat-dairy','لبنیات پامیر','6291000000002',32,45,0,10,'دانه','کارتن',12),
  P('p3','آب معدنی 1.5 لیتر','cat-food','آب هریوا','6291000000003',18,25,0,20,'دانه','کارتن',12),
  P('p4','نوشابه 330ml','cat-food','نوشابه شرق','6291000000004',24,35,0,18,'دانه','کارتن',24),
  P('p5','چای سیاه 500 گرم','cat-food','چای بهار','6291000000005',145,180,0,5),
  P('p6','بسکویت ساده','cat-snacks','شیرین هرات','6291000000006',28,40,0,12,'دانه','کارتن',24),
  P('p7','شکلات تخته‌ای','cat-snacks','شیرین هرات','6291000000007',20,30,0,15,'دانه','جعبه',30),
  P('p8','قلم آبی','cat-stationery','قلم آریا','6291000000008',15,25,0,20,'دانه','جعبه',24),
  P('p9','قلم مشکی','cat-stationery','قلم آریا','6291000000009',15,25,0,20,'دانه','جعبه',24),
  P('p10','کتابچه 80 برگ','cat-stationery','دفتر سپید','6291000000010',58,85,0,8,'دانه','بسته',12),
  P('p11','کاغذ A4 بسته 500','cat-stationery','Paper One','6291000000011',265,320,0,4),
  P('p12','مایع ظرفشویی','cat-home','خانه پاک','6291000000012',92,125,0,6),
  P('p13','دستمال کاغذی','cat-hygiene','پاکیزه','6291000000013',42,58,0,10,'دانه','بسته',12),
  P('p14','صابون','cat-hygiene','پاکیزه','6291000000014',25,38,0,10,'دانه','کارتن',24),
  P('p15','نخ خیاطی','cat-sewing','نخ هریوا','6291000000015',12,20,0,25,'دانه','جعبه',50),
  P('p16','سوزن خیاطی بسته','cat-sewing','ابزار خیاطی شرق','6291000000016',18,30,0,15,'بسته','جعبه',20),
  P('p17','باتری قلمی جفت','cat-home','Power Cell','6291000000017',32,50,0,10,'جفت','بسته',12),
  P('p18','کیسه زباله رول','cat-home','خانه پاک','6291000000018',35,50,0,8,'رول','کارتن',24)
 ];
 D.products[7].barcodes.push('12345678901234567890123456789');
 D.customers=[
  {id:'c0',name:'مشتری عمومی',phone:'',balance:0},
  {id:'c1',name:'احمد رحیمی',phone:'0701000001',balance:0},{id:'c2',name:'فاطمه احمدی',phone:'0701000002',balance:0},
  {id:'c3',name:'محمد کریمی',phone:'0701000003',balance:0},{id:'c4',name:'مریم نوری',phone:'0701000004',balance:0},
  {id:'c5',name:'فروشگاه همکار بهار',phone:'0701000005',balance:0},{id:'c6',name:'علی رضایی',phone:'0701000006',balance:0},
  {id:'c7',name:'سارا حسینی',phone:'0701000007',balance:0},{id:'c8',name:'کتاب‌فروشی دانش',phone:'0701000008',balance:0},
  {id:'c9',name:'خیاطی ستاره',phone:'0701000009',balance:0},{id:'c10',name:'حمید صادقی',phone:'0701000010',balance:0}
 ];
 D.suppliers=[
  {id:'s1',name:'شرکت پخش هریوا',phone:'0792000001',balance:0},{id:'s2',name:'لبنیات پامیر',phone:'0792000002',balance:0},
  {id:'s3',name:'قرطاسیه مرکزی',phone:'0792000003',balance:0},{id:'s4',name:'خانه پاک',phone:'0792000004',balance:0},
  {id:'s5',name:'شیرین هرات',phone:'0792000005',balance:0},{id:'s6',name:'بازرگانی عمومی شرق',phone:'0792000006',balance:0}
 ];
 D.sales=[];D.purchases=[];D.inventory=[];D.expenses=[];D.supplierPayments=[];D.customerReceipts=[];D.inventorySnapshots=[];D.financialPeriods=[];D.deletedSales=[];
 D.financialPeriod={no:1,start:start.toISOString()};
 function at(offset,h,m){const d=new Date(start);d.setDate(d.getDate()+offset);d.setHours(h||10,m==null?15:m,0,0);return d.toISOString()}
 const dayCount=Math.max(1,Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()-start.getTime())/86400000)+1);
 const opening={};D.products.forEach(function(p,i){opening[p.id]=90+(i%6)*18});
 let purNo=1;
 for(let day=1;day<dayCount;day+=4){
  const p=D.products[(day*3)%D.products.length],sup=D.suppliers[(day+1)%D.suppliers.length],pack=p.unitConversionEnabled,qty=pack?(1+(day%4)):(8+(day%12)),units=pack?qty*p.unitsPerPurchase:qty,total=units*p.buy,payment=(purNo%2===0?'نسیه':'نقدی');
  D.purchases.push({id:'demo-pur-'+purNo++,time:at(day,10,20),productId:p.id,productName:p.name,supplierId:sup.id,supplierName:sup.name,purchaseMode:pack?'package':'unit',qty:qty,unitsAdded:units,unitCost:p.buy,total:total,payment:payment});
  if(payment==='نسیه')sup.balance+=total;opening[p.id]+=units;
 }
 let no=1;
 for(let day=0;day<dayCount;day++){
  const count=2+(day%5);
  for(let j=0;j<count;j++){
   const p=D.products[(day*2+j*5)%D.products.length],qty=1+((day+j)%3),credit=((day+j)%8===0),cust=credit?D.customers[1+((day+j)%10)]:D.customers[0],discount=((day+j)%13===0)?5:0,total=Math.max(0,p.sell*qty-discount);
   const sl={id:'demo-sale-'+day+'-'+j,no:no++,time:at(day,9+j*2,(day+j*7)%55),items:[{id:p.id,name:p.name,barcode:p.barcode,buy:p.buy,sell:p.sell,qty:qty,baseUnit:p.baseUnit}],subtotal:p.sell*qty,discount:discount,total:total,payment:credit?'نسیه':'نقدی',customerId:cust.id,revisions:[]};
   D.sales.push(sl);opening[p.id]-=qty;if(credit)cust.balance+=total
  }
  if(day%5===0)D.expenses.push({id:'demo-exp-'+day,time:at(day,17,10),category:['حمل‌ونقل','برق','مصارف روزانه','بسته‌بندی'][day%4],amount:120+(day%7)*45,note:'نمونه آموزشی'});
  if(day%7===0){const c=D.customers[1+((day/7)%10|0)],amt=Math.min(220+(day%4)*80,Math.max(0,c.balance));if(amt>0){D.customerReceipts.push({id:'demo-cr-'+day,time:at(day,15,10),customerId:c.id,customerName:c.name,amount:amt,note:'دریافت بخشی از قرض'});c.balance=Math.max(0,c.balance-amt)}}
  if(day%8===0){const s=D.suppliers[(day/8)%D.suppliers.length|0],amt=Math.min(450+(day%4)*100,Math.max(0,s.balance));if(amt>0){D.supplierPayments.push({id:'demo-sp-'+day,time:at(day,14,20),supplierId:s.id,supplierName:s.name,amount:amt,note:'پرداخت دوره‌ای'});s.balance=Math.max(0,s.balance-amt)}}
 }
 D.products.forEach(function(p,i){D.inventory.push({id:'demo-open-'+p.id,time:at(0,8,5),productId:p.id,productName:p.name,type:'موجودی اولیه',qty:90+(i%6)*18,ref:'شروع نسخه آموزشی'})});
 D.purchases.forEach(function(x){D.inventory.push({id:'inv-p-'+x.id,time:x.time,productId:x.productId,productName:x.productName,type:'خرید',qty:x.unitsAdded,ref:x.supplierName})});
 D.sales.forEach(function(sl){sl.items.forEach(function(i){D.inventory.push({id:'inv-s-'+sl.id+'-'+i.id,time:sl.time,productId:i.id,productName:i.name,type:'فروش',qty:-i.qty,ref:'#'+sl.no})})});
 [5,11,16].forEach(function(idx,n){const p=D.products[idx],q=n===1?-2:3;opening[p.id]+=q;D.inventory.push({id:'demo-adj-'+n,time:at(Math.max(3,dayCount-18+n*4),18,5),productId:p.id,productName:p.name,type:'اصلاح موجودی',qty:q,ref:'انبارگردانی آموزشی'})});
 D.products.forEach(function(p){p.stock=Math.max(0,Math.round(opening[p.id]))});
 D.products[1].stock=0;D.products[9].stock=4;D.products[14].stock=9;
 for(let d=0;d<dayCount;d+=5){const sd=new Date(start);sd.setDate(sd.getDate()+d);D.inventorySnapshots.push({date:dateKey(sd),value:D.products.reduce(function(a,p){return a+p.buy*Math.max(0,p.stock+(dayCount-d)%9)},0)})}
 return normalizeDB(D)
}
if($('#loadTrainingDemo'))$('#loadTrainingDemo').onclick=async function(){
 if(!confirm('نسخه آموزشی کامل ۲ ماه و ۱۰ روزه بارگذاری شود؟ ابتدا از اطلاعات فعلی Backup گرفته می‌شود و سپس کالاها، دسته‌ها، مشتریان، شرکت‌ها، خرید، فروش، قرض، هزینه و انبار با داده آموزشی پر می‌شوند.'))return;
 if(window.YaranNative&&window.YaranNative.isNative)await createAutoBackup(false);
 db=buildTrainingDemo();moneyVisible=true;await persistState(db);renderAll();closeModal();toast('نسخه آموزشی ۲ ماه و ۱۰ روزه فعال شد')
};
$('#resetDemo').onclick=function(){if(confirm('تمام اطلاعات حسابداری آسان به حالت اولیه بازنشانی شود؟ این کار قابل برگشت نیست.')){db=normalizeDB(clone(DEFAULT));moneyVisible=true;save();toast('حسابداری آسان به حالت اولیه بازنشانی شد')}};
$('#exportCsv').onclick=async function(){const list=filteredSalesForReport(),lines=[['شماره فاکتور','تاریخ و زمان','مشتری','روش پرداخت','تعداد اقلام','مبلغ'],...list.map(function(s){const c=db.customers.find(function(x){return x.id===s.customerId});return [s.no,formatDateTime(s.time),c?c.name:'',s.payment,s.items.reduce(function(a,i){return a+i.qty},0),s.total]})],csv='\ufeff'+lines.map(function(r){return r.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"'}).join(',')}).join('\n'),filename='hesabdari-asan-sales-'+dateKey()+'.csv';try{if(window.YaranNative&&window.YaranNative.isNative&&window.YaranNative.exportText){const path=await window.YaranNative.exportText(filename,csv);toast(path?'فایل CSV در Downloads ذخیره شد':'خروجی CSV انجام نشد');return}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},500)}catch(e){console.error(e);toast('خروجی CSV انجام نشد')}};

function markScannerDetected(code){scannerDetectedAt=Date.now();if($('#scannerStatusPill')){$('#scannerStatusPill').textContent='متصل / فعال';$('#scannerStatusPill').className='pill success'}if($('#scannerStatusTitle'))$('#scannerStatusTitle').textContent='بارکدخوان فعال است';if($('#scannerStatusHint'))$('#scannerStatusHint').textContent='اسکن سریع USB HID شناسایی شد.';if($('#lastScan'))$('#lastScan').textContent='آخرین اسکن: '+code+' · '+formatTime(new Date())}
function refreshScannerStatus(){if(!$('#scannerStatusPill'))return;if(!scannerDetectedAt){$('#scannerStatusPill').textContent='شناسایی نشده';$('#scannerStatusPill').className='pill warning';return}if(Date.now()-scannerDetectedAt>300000){$('#scannerStatusPill').textContent='وضعیت نامشخص';$('#scannerStatusPill').className='pill warning';if($('#scannerStatusHint'))$('#scannerStatusHint').textContent='در 5 دقیقه اخیر اسکن دریافت نشده؛ برای بررسی یک بارکد اسکن کنید.'}}
$('#globalSearch').addEventListener('keydown',function(e){if(e.key==='Enter'){const q=e.target.value.trim();if(q){go('pos');$('#barcodeInput').value=q;renderPosSearch(q);$('#barcodeInput').focus();e.target.value=''}}});
document.addEventListener('keydown',function(e){if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus()}if(e.key==='F4'){e.preventDefault();if($('#page-pos').classList.contains('active'))checkout()}if(e.ctrlKey&&e.key.toLowerCase()==='p'){e.preventDefault();printReceipt()}});
let scanBuffer='',scanLast=0;document.addEventListener('keydown',function(e){if(['INPUT','TEXTAREA','SELECT'].indexOf(document.activeElement&&document.activeElement.tagName)>-1)return;const now=performance.now();if(now-scanLast>80)scanBuffer='';scanLast=now;const suffix=db.settings.scannerSuffix||'Enter';if(e.key===suffix||e.key==='Enter'){if(scanBuffer.length>=5){const b=scanBuffer;scanBuffer='';markScannerDetected(b);if(!$('#page-pos').classList.contains('active'))go('pos');findAndAdd(b)}return}if(e.key.length===1)scanBuffer+=e.key});
if($('#creatorContact'))$('#creatorContact').onclick=async function(e){e.preventDefault();const url=this.href;try{if(window.YaranNative&&window.YaranNative.openExternal){await window.YaranNative.openExternal(url)}else window.open(url,'_blank')}catch(err){window.open(url,'_blank')}};
$('#menuBtn').onclick=function(){$('.sidebar').classList.toggle('open')};
setInterval(renderWorkSession,1000);setInterval(refreshScannerStatus,30000);setInterval(function(){maybeAutoBackup(false)},60000);
updateInventorySnapshot();applyTheme();renderAll();renderPaymentRequirement();maybeAutoBackup(false);
(async function setupCloseProtection(){try{if(window.__TAURI__&&window.__TAURI__.window&&window.__TAURI__.window.getCurrentWindow){const win=window.__TAURI__.window.getCurrentWindow();await win.onCloseRequested(async function(e){e.preventDefault();if(!confirm('آیا برنامه بسته شود؟ قبل از خروج یک پشتیبان سبک از دیتابیس گرفته می‌شود.'))return;try{await createAutoBackup(false)}catch(ignore){}await win.destroy()})}}catch(e){console.warn('close protection unavailable',e)}})();


/* table-wrap vertical wheel forwarding: horizontal tables never trap page scrolling */
document.addEventListener('wheel',function(e){
 const wrap=e.target&&e.target.closest?e.target.closest('.table-wrap'):null;
 if(!wrap||Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;
 const page=wrap.closest('.page');
 if(page){page.scrollTop+=e.deltaY;e.preventDefault()}
},{passive:false});

/* Desktop-native interaction guards */
(function(){
  document.addEventListener('wheel', function(e){
    if(e.ctrlKey) e.preventDefault();
  }, {passive:false});
  document.addEventListener('keydown', function(e){
    if(e.ctrlKey && ['+','=','-','0'].includes(e.key)) e.preventDefault();
  });
  document.addEventListener('dragstart', function(e){
    if(!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) e.preventDefault();
  });
})();
