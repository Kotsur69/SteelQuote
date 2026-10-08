"use strict";(()=>{var e={};e.id=3963,e.ids=[3963],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},78893:e=>{e.exports=require("buffer")},84770:e=>{e.exports=require("crypto")},92048:e=>{e.exports=require("fs")},55315:e=>{e.exports=require("path")},21764:e=>{e.exports=require("util")},8678:e=>{e.exports=import("pg")},8832:(e,t,a)=>{a.a(e,async(e,o)=>{try{a.r(t),a.d(t,{originalPathname:()=>f,patchFetch:()=>p,requestAsyncStorage:()=>c,routeModule:()=>d,serverHooks:()=>y,staticGenerationAsyncStorage:()=>m});var i=a(49303),n=a(88716),s=a(60670),l=a(12924),r=e([l]);l=(r.then?(await r)():r)[0];let d=new i.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/generate-pdf/route",pathname:"/api/generate-pdf",filename:"route",bundlePath:"app/api/generate-pdf/route"},resolvedPagePath:"C:\\Users\\mmazur\\source\\repos\\AMSteel_Quote\\finance_calculator_deployed\\nextjs_space\\app\\api\\generate-pdf\\route.ts",nextConfigOutput:"",userland:l}),{requestAsyncStorage:c,staticGenerationAsyncStorage:m,serverHooks:y}=d,f="/api/generate-pdf/route";function p(){return(0,s.patchFetch)({serverHooks:y,staticGenerationAsyncStorage:m})}o()}catch(e){o(e)}})},12924:(e,t,a)=>{a.a(e,async(e,o)=>{try{a.r(t),a.d(t,{POST:()=>u,dynamic:()=>g});var i=a(87070),n=a(60727),s=a(67023),l=a(54906),r=a(17206),p=a(92048),d=a.n(p),c=a(55315),m=a.n(c),y=e([n]);function f(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}n=(y.then?(await y)():y)[0];let g="force-dynamic";async function u(e){try{let t=await (0,n.nc)();if("error"in t)return t.error;let a=t.ctx,{items:o,clientInfo:p,offerName:c,offerDate:y,currency:u,eurPlnRate:g,language:b,validFrom:h,validTo:x,paymentTermDays:v}=await e.json();if(!o||!Array.isArray(o)||0===o.length)return i.NextResponse.json({error:"No items provided"},{status:400});let w=a.email||"",$=(0,l.Ad)(b)?b:"pl",N=y||new Date().toLocaleDateString(r.S[$]),L=(0,s.DB)(u)?u:s.a7,k=(0,s.bJ)(g),T="number"==typeof v&&Number.isFinite(v)&&v>=0&&v<=365?v:void 0,P=function(e,t,a,o,i,n,s,l,p,c,y){let u=function(){try{let e=m().join(process.cwd(),"public","logo.jpg"),t=d().readFileSync(e);return`data:image/jpeg;base64,${t.toString("base64")}`}catch{return""}}(),g=r.g[l],b="PLN"===n,h=b?s:1,x=b?"zł":"€",v=e.reduce((e,t)=>e+t.quantity,0),w=e.reduce((e,t)=>e+t.pricePerTon*t.quantity,0)*h,$=e.map((e,t)=>{let a=`${e.thickness} \xd7 ${e.width}${e.isCoil?"":` \xd7 ${e.length}`}`,o={HRS:"#3b82f6",CR:"#8b5cf6",HDG:"#10b981",PICKLED:"#e0499a",TEARDROP:"#22c1d6",ZM:"#8b7cf6"}[e.steelType]??"#64748b",i=(e.notes??[]).map(e=>`<span style="display:inline-block;background:#f1f5f9;border-radius:3px;padding:1px 5px;margin:1px 2px 1px 0;white-space:nowrap;">${f(e)}</span>`).join("");return`
      <tr>
        <td style="text-align:center;font-weight:600;">${t+1}</td>
        <td>
          <div style="font-weight:600;font-size:11px;">${f(e.grade)}</div>
          <div style="font-size:10px;color:#64748b;">${a}${e.coating?" / "+f(e.coating):""}${e.isCoil?" "+g.coilSuffix:""}</div>
        </td>
        <td style="text-align:center;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${o};color:#fff;font-size:10px;font-weight:700;">${f(e.steelType)}</span></td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${e.thickness.toFixed(2)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${e.width.toFixed(0)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${e.isCoil?"-":e.length.toFixed(0)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;white-space:nowrap;">${e.quantity.toFixed(2)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;font-weight:600;white-space:nowrap;">${Math.ceil(e.pricePerTon*h)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;white-space:nowrap;">${Math.ceil(e.pricePerTon*e.quantity*h)}</td>
        <td style="font-size:8px;color:#64748b;line-height:1.5;">${i}</td>
      </tr>`}).join(""),N=`<colgroup>
    <col style="width:30px">
    <col>
    <col style="width:45px">
    <col style="width:55px">
    <col style="width:55px">
    <col style="width:55px">
    <col style="width:70px">
    <col style="width:78px">
    <col style="width:130px">
    <col style="width:168px">
  </colgroup>`;return`<!DOCTYPE html>
<html lang="${l}">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 20mm 15mm 25mm 15mm; size: A4 landscape; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.5; }
  .page { padding: 0; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #1e40af; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .logo { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; }
  .company-name { font-size: 18px; font-weight: 800; color: #1e40af; letter-spacing: 0.5px; }
  .company-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .offer-meta { text-align: right; }
  .offer-meta .offer-title { font-size: 16px; font-weight: 700; color: #1e293b; }
  .offer-meta .meta-row { font-size: 10px; color: #64748b; margin-top: 3px; }
  .offer-meta .meta-val { font-weight: 600; color: #1e293b; }
  .info-grid { display: flex; gap: 24px; margin-bottom: 18px; }
  .info-block { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .info-block-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #1e40af; margin-bottom: 8px; }
  .info-row { font-size: 10px; margin-bottom: 3px; }
  .info-row .lbl { color: #64748b; display: inline-block; width: 70px; }
  .info-row .val { font-weight: 600; color: #1e293b; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 16px; }
  .items-table { margin-bottom: 0; }
  thead th { background: #1e40af; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 8px 10px; border: none; }
  thead th:first-child { border-radius: 6px 0 0 0; }
  thead th:last-child { border-radius: 0 6px 0 0; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; overflow: hidden; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:hover { background: #eff6ff; }
  .totals-table { break-inside: avoid; page-break-inside: avoid; }
  .totals-table td { padding: 10px; font-weight: 700; font-size: 12px; background: #1e293b; color: #fff; border: none; overflow: visible; white-space: nowrap; }
  .totals-table td:first-child { border-radius: 0 0 0 6px; }
  .totals-table td:last-child { border-radius: 0 0 6px 0; }
  .footer { margin-top: 24px; padding-top: 14px; border-top: 2px solid #e2e8f0; }
  .footer-notes { font-size: 10px; color: #64748b; line-height: 1.6; }
  .footer-notes li { margin-bottom: 2px; }
  .footer-sign { margin-top: 20px; display: flex; justify-content: space-between; }
  .sign-block { text-align: center; }
  .sign-line { width: 180px; border-top: 1px solid #94a3b8; margin-top: 40px; padding-top: 4px; font-size: 10px; color: #64748b; }
  .sign-name { font-weight: 600; color: #1e293b; font-size: 11px; }
  .badge-total { background: #059669; color: #fff; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 12px; white-space: nowrap; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      ${u?`<img src="${u}" class="logo" alt="Logo">`:""}
      <div>
        <div class="company-name">Steel Pricing Hub</div>
        <div class="company-sub">${g.companySub}</div>
      </div>
    </div>
    <div class="offer-meta">
      <div class="offer-title">${f(a)||g.defaultOfferTitle}</div>
      <div class="meta-row"><span class="lbl">${g.dateLabel}</span><span class="meta-val">${f(o)}</span></div>
      <div class="meta-row"><span class="lbl">${g.preparedByLabel}</span><span class="meta-val">${f(i)||"-"}</span></div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <div class="info-block-title">${g.recipientTitle}</div>
      ${t.company?`<div class="info-row"><span class="lbl">${g.companyLabel}</span><span class="val">${f(t.company)}</span></div>`:""}
      ${t.firstName||t.lastName?`<div class="info-row"><span class="lbl">${g.personLabel}</span><span class="val">${f(t.firstName)} ${f(t.lastName)}</span></div>`:""}
      ${t.address?`<div class="info-row"><span class="lbl">${g.addressLabel}</span><span class="val">${f(t.address)}</span></div>`:""}
      ${t.nip?`<div class="info-row"><span class="lbl">${g.taxIdLabel}</span><span class="val">${f(t.nip)}</span></div>`:""}
      ${t.sapId?`<div class="info-row"><span class="lbl">${g.sapIdLabel}</span><span class="val">${f(t.sapId)}</span></div>`:""}
      ${t.phone?`<div class="info-row"><span class="lbl">${g.phoneLabel}</span><span class="val">${f(t.phone)}</span></div>`:""}
      ${t.email?`<div class="info-row"><span class="lbl">${g.emailLabel}</span><span class="val">${f(t.email)}</span></div>`:""}
    </div>
    <div class="info-block">
      <div class="info-block-title">${g.summaryTitle}</div>
      <div class="info-row"><span class="lbl">${g.itemsLabel}</span><span class="val">${e.length}</span></div>
      <div class="info-row"><span class="lbl">${g.totalTonsLabel}</span><span class="val" style="white-space:nowrap;">${v.toFixed(2)} t</span></div>
      <div class="info-row"><span class="lbl">${g.valueLabel}</span><span class="val" style="color:#059669;font-size:12px;white-space:nowrap;">${Math.ceil(w)} ${x}</span></div>
      <div class="info-row"><span class="lbl">${g.typesLabel}</span><span class="val">${f([...new Set(e.map(e=>e.steelType))].join(", "))}</span></div>
    </div>
  </div>

  <table class="items-table">
    ${N}
    <thead>
      <tr>
        <th style="text-align:center;">${g.colNo}</th>
        <th style="text-align:left;">${g.colDesc}</th>
        <th style="text-align:center;">${g.colType}</th>
        <th style="text-align:right;">${g.colThickness}</th>
        <th style="text-align:right;">${g.colWidth}</th>
        <th style="text-align:right;">${g.colLength}</th>
        <th style="text-align:right;">${g.colQty}</th>
        <th style="text-align:right;">${g.colPrice} ${x}/t</th>
        <th style="text-align:right;">${g.colValue} ${x}</th>
        <th>${g.colNotes}</th>
      </tr>
    </thead>
    <tbody>
      ${$}
    </tbody>
  </table>
  <!-- Podsumowanie jako OSOBNA tabela (nie <tfoot> tej samej tabeli) — silnik
       druku Chrome powtarza <thead>/<tfoot> na KAŻDEJ stronie, na kt\xf3rą tabela
       się rozleje. Jako osobny element idzie w flow strony jednorazowo, tuż po
       ostatnim wierszu pozycji, niezależnie od tego ile stron zajęły pozycje. -->
  <table class="totals-table">
    ${N}
    <tbody>
      <tr>
        <td colspan="6" style="text-align:right;text-transform:uppercase;letter-spacing:1px;font-size:10px;">${g.totalRowLabel}</td>
        <td style="text-align:right;">${v.toFixed(2)} t</td>
        <td style="text-align:right;"></td>
        <td style="text-align:right;"><span class="badge-total">${Math.ceil(w)} ${x}</span></td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <ul class="footer-notes">
      <li>${g.pricesNote(b?"PLN":"EUR")}</li>
      ${b?`<li>${g.rateNote(s.toFixed(4).replace(/0+$/,"").replace(/\.$/,""))}</li>`:""}
      <li>${g.invoiceNote}</li>
      ${p&&c?`<li>${f(g.validityRangeNote(p,c))}</li>`:""}
      ${"number"==typeof y&&y>0?`<li>${f(g.validityHoursNote(24*y))}</li>`:""}
      <li>${"number"==typeof y?0===y?g.paymentPrepaymentNote:f(g.paymentTermDaysNote(y)):g.paymentNote}</li>
      <li>${g.minQuantityNote}</li>
      <li>${g.deliveryNote}</li>
      <li>${g.toleranceNote}</li>
    </ul>
    <div class="footer-sign">
      <div class="sign-block">
        <div class="sign-name">${f(i)}</div>
        <div class="sign-line">${g.signPreparedBy}</div>
      </div>
      <div class="sign-block">
        <div class="sign-name">&nbsp;</div>
        <div class="sign-line">${g.signClientAcceptance}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`}(o,p||{firstName:"",lastName:"",company:"",address:"",nip:"",sapId:"",phone:"",email:""},c||"",N,w,L,k,$,"string"==typeof h&&h?h:void 0,"string"==typeof x&&x?x:void 0,T),z=await fetch("https://apps.abacus.ai/api/createConvertHtmlToPdfRequest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deployment_token:process.env.ABACUSAI_API_KEY,html_content:P,pdf_options:{format:"A4",landscape:!0,print_background:!0,margin:{top:"10mm",right:"10mm",bottom:"15mm",left:"10mm"}},base_url:process.env.NEXTAUTH_URL||""})});if(!z.ok){let e=await z.json().catch(()=>({error:"PDF request failed"}));return console.error("PDF create error:",e),i.NextResponse.json({success:!1,error:e.error||"PDF request failed"},{status:500})}let{request_id:S}=await z.json();if(!S)return i.NextResponse.json({success:!1,error:"No request ID"},{status:500});let D=0;for(;D<120;){await new Promise(e=>setTimeout(e,1500));let e=await fetch("https://apps.abacus.ai/api/getConvertHtmlToPdfStatus",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:S,deployment_token:process.env.ABACUSAI_API_KEY})}),t=await e.json(),a=t?.status||"FAILED",o=t?.result||null;if("SUCCESS"===a){if(o&&o.result){let e=Buffer.from(o.result,"base64");return new i.NextResponse(e,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="oferta_${Date.now()}.pdf"`}})}return i.NextResponse.json({success:!1,error:"PDF generated but no data"},{status:500})}if("FAILED"===a){let e=o?.error||"PDF generation failed";return console.error("PDF generation failed:",e),i.NextResponse.json({success:!1,error:e},{status:500})}D++}return i.NextResponse.json({success:!1,error:"PDF generation timed out"},{status:500})}catch(e){return console.error("Error generating PDF:",e),i.NextResponse.json({success:!1,error:"Failed to generate PDF"},{status:500})}}o()}catch(e){o(e)}})},17206:(e,t,a)=>{a.d(t,{S:()=>o,g:()=>i});let o={pl:"pl-PL",en:"en-GB",cs:"cs-CZ",de:"de-DE"},i={pl:{companySub:"Kalkulator Dopłat Stalowych",defaultOfferTitle:"Oferta cenowa",dateLabel:"Data: ",preparedByLabel:"Sporządził: ",recipientTitle:"Odbiorca",companyLabel:"Firma:",personLabel:"Osoba:",addressLabel:"Adres:",taxIdLabel:"NIP:",sapIdLabel:"SAP ID:",phoneLabel:"Telefon:",emailLabel:"Email:",summaryTitle:"Podsumowanie",itemsLabel:"Pozycji:",totalTonsLabel:"Łącznie t:",valueLabel:"Wartość:",typesLabel:"Typy:",colNo:"Nr",colDesc:"Gatunek / Opis",colType:"Typ",colThickness:"Grub. mm",colWidth:"Szer. mm",colLength:"Dł. mm",colQty:"Ilość t",colPrice:"Cena",colValue:"Wartość",colNotes:"Uwagi",coilSuffix:"(KRĄG)",totalRowLabel:"RAZEM:",pricesNote:e=>`Ceny w ${e}/t, bez podatku VAT.`,rateNote:e=>`Kurs przeliczeniowy: 1 EUR = ${e} PLN (kurs z dnia wyceny).`,invoiceNote:"Faktura wystawiana na podstawie wagi brutto.",validityRangeNote:(e,t)=>`Okres ważności oferty: ${e} – ${t}.`,validityHoursNote:e=>`Ważność oferty: ${e}h od daty wystawienia.`,paymentNote:"Warunki płatności: wg ustaleń indywidualnych.",paymentTermDaysNote:e=>`Termin płatności: ${e} dni.`,paymentPrepaymentNote:"Warunki płatności: przedpłata.",minQuantityNote:"Minimalna ilość: 5 ton na pozycję.",deliveryNote:"Termin dostawy: po potwierdzeniu dostępności materiału.",toleranceNote:"Tolerancja wagowa +/- 10%.",signPreparedBy:"Sporządził",signClientAcceptance:"Akceptacja klienta"},en:{companySub:"Steel Surcharge Calculator",defaultOfferTitle:"Price Offer",dateLabel:"Date: ",preparedByLabel:"Prepared by: ",recipientTitle:"Recipient",companyLabel:"Company:",personLabel:"Contact:",addressLabel:"Address:",taxIdLabel:"Tax ID:",sapIdLabel:"SAP ID:",phoneLabel:"Phone:",emailLabel:"Email:",summaryTitle:"Summary",itemsLabel:"Items:",totalTonsLabel:"Total t:",valueLabel:"Value:",typesLabel:"Types:",colNo:"No.",colDesc:"Grade / Description",colType:"Type",colThickness:"Thick. mm",colWidth:"Width mm",colLength:"Length mm",colQty:"Qty t",colPrice:"Price",colValue:"Value",colNotes:"Notes",coilSuffix:"(COIL)",totalRowLabel:"TOTAL:",pricesNote:e=>`Prices in ${e}/t, excluding VAT.`,rateNote:e=>`Exchange rate: 1 EUR = ${e} PLN (rate as of valuation date).`,invoiceNote:"Invoice issued based on gross weight.",validityRangeNote:(e,t)=>`Offer validity period: ${e} – ${t}.`,validityHoursNote:e=>`Offer validity: ${e}h from issue date.`,paymentNote:"Payment terms: as individually agreed.",paymentTermDaysNote:e=>`Payment term: ${e} days.`,paymentPrepaymentNote:"Payment terms: prepayment.",minQuantityNote:"Minimum quantity: 5 tons per item.",deliveryNote:"Delivery time: upon confirmation of material availability.",toleranceNote:"Weight tolerance +/- 10%.",signPreparedBy:"Prepared by",signClientAcceptance:"Client acceptance"},cs:{companySub:"Kalkul\xe1tor př\xedplatků za ocel",defaultOfferTitle:"Cenov\xe1 nab\xeddka",dateLabel:"Datum: ",preparedByLabel:"Vypracoval: ",recipientTitle:"Odběratel",companyLabel:"Firma:",personLabel:"Kontakt:",addressLabel:"Adresa:",taxIdLabel:"DIČ:",sapIdLabel:"SAP ID:",phoneLabel:"Telefon:",emailLabel:"Email:",summaryTitle:"Souhrn",itemsLabel:"Položky:",totalTonsLabel:"Celkem t:",valueLabel:"Hodnota:",typesLabel:"Typy:",colNo:"Č.",colDesc:"Jakost / Popis",colType:"Typ",colThickness:"Tloušťka mm",colWidth:"Š\xedřka mm",colLength:"D\xe9lka mm",colQty:"Množ. t",colPrice:"Cena",colValue:"Hodnota",colNotes:"Pozn\xe1mky",coilSuffix:"(SVITEK)",totalRowLabel:"CELKEM:",pricesNote:e=>`Ceny v ${e}/t, bez DPH.`,rateNote:e=>`Směnn\xfd kurz: 1 EUR = ${e} PLN (kurz ke dni oceněn\xed).`,invoiceNote:"Faktura vystavena na z\xe1kladě hrub\xe9 hmotnosti.",validityRangeNote:(e,t)=>`Doba platnosti nab\xeddky: ${e} – ${t}.`,validityHoursNote:e=>`Platnost nab\xeddky: ${e}h od data vystaven\xed.`,paymentNote:"Platebn\xed podm\xednky: dle individu\xe1ln\xed dohody.",paymentTermDaysNote:e=>`Splatnost: ${e} dn\xed.`,paymentPrepaymentNote:"Platebn\xed podm\xednky: platba předem.",minQuantityNote:"Minim\xe1ln\xed množstv\xed: 5 tun na položku.",deliveryNote:"Term\xedn dod\xe1n\xed: po potvrzen\xed dostupnosti materi\xe1lu.",toleranceNote:"Hmotnostn\xed tolerance +/- 10 %.",signPreparedBy:"Vypracoval",signClientAcceptance:"Akceptace klienta"},de:{companySub:"Stahl-Zuschlagsrechner",defaultOfferTitle:"Preisangebot",dateLabel:"Datum: ",preparedByLabel:"Erstellt von: ",recipientTitle:"Empf\xe4nger",companyLabel:"Firma:",personLabel:"Kontakt:",addressLabel:"Adresse:",taxIdLabel:"USt-ID:",sapIdLabel:"SAP ID:",phoneLabel:"Telefon:",emailLabel:"Email:",summaryTitle:"Zusammenfassung",itemsLabel:"Positionen:",totalTonsLabel:"Gesamt t:",valueLabel:"Wert:",typesLabel:"Typen:",colNo:"Nr.",colDesc:"G\xfcte / Beschreibung",colType:"Typ",colThickness:"Dicke mm",colWidth:"Breite mm",colLength:"L\xe4nge mm",colQty:"Menge t",colPrice:"Preis",colValue:"Wert",colNotes:"Hinweise",coilSuffix:"(COIL)",totalRowLabel:"GESAMT:",pricesNote:e=>`Preise in ${e}/t, ohne MwSt.`,rateNote:e=>`Wechselkurs: 1 EUR = ${e} PLN (Kurs zum Bewertungsdatum).`,invoiceNote:"Rechnungsstellung auf Basis des Bruttogewichts.",validityRangeNote:(e,t)=>`G\xfcltigkeitszeitraum des Angebots: ${e} – ${t}.`,validityHoursNote:e=>`Angebotsg\xfcltigkeit: ${e}h ab Ausstellungsdatum.`,paymentNote:"Zahlungsbedingungen: nach individueller Vereinbarung.",paymentTermDaysNote:e=>`Zahlungsziel: ${e} Tage.`,paymentPrepaymentNote:"Zahlungsbedingungen: Vorkasse.",minQuantityNote:"Mindestmenge: 5 Tonnen pro Position.",deliveryNote:"Liefertermin: nach Best\xe4tigung der Materialverf\xfcgbarkeit.",toleranceNote:"Gewichtstoleranz +/- 10%.",signPreparedBy:"Erstellt von",signClientAcceptance:"Kundenakzeptanz"}}},54906:(e,t,a)=>{function o(e){return"pl"===e||"en"===e||"cs"===e||"de"===e}a.d(t,{Ad:()=>o})}};var t=require("../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),o=t.X(0,[9276,5972,2015,727],()=>a(8832));module.exports=o})();