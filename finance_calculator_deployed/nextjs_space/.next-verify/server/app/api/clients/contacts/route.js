"use strict";(()=>{var e={};e.id=8624,e.ids=[8624],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},78893:e=>{e.exports=require("buffer")},84770:e=>{e.exports=require("crypto")},21764:e=>{e.exports=require("util")},8678:e=>{e.exports=import("pg")},73906:(e,t,n)=>{n.a(e,async(e,a)=>{try{n.r(t),n.d(t,{originalPathname:()=>d,patchFetch:()=>c,requestAsyncStorage:()=>m,routeModule:()=>u,serverHooks:()=>E,staticGenerationAsyncStorage:()=>p});var r=n(49303),i=n(88716),s=n(60670),l=n(9999),o=e([l]);l=(o.then?(await o)():o)[0];let u=new r.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/clients/contacts/route",pathname:"/api/clients/contacts",filename:"route",bundlePath:"app/api/clients/contacts/route"},resolvedPagePath:"C:\\Users\\mmazur\\source\\repos\\AMSteel_Quote\\finance_calculator_deployed\\nextjs_space\\app\\api\\clients\\contacts\\route.ts",nextConfigOutput:"",userland:l}),{requestAsyncStorage:m,staticGenerationAsyncStorage:p,serverHooks:E}=u,d="/api/clients/contacts/route";function c(){return(0,s.patchFetch)({serverHooks:E,staticGenerationAsyncStorage:p})}a()}catch(e){a(e)}})},9999:(e,t,n)=>{n.a(e,async(e,a)=>{try{n.r(t),n.d(t,{GET:()=>m,POST:()=>p});var r=n(87070),i=n(9487),s=n(60727),l=n(67785),o=n(69319),c=n(26409),u=e([i,s]);async function m(e){let t=await (0,s.nc)();if("error"in t)return t.error;try{let t=e.nextUrl.searchParams,n=(t.get("company")||"").trim(),a=(t.get("nip")||"").trim(),s=(t.get("q")||"").trim();if(""===n&&""===a)return r.NextResponse.json({contacts:[]});let c=await (0,o.r8)(i.Z,n,a);if(null===c)return r.NextResponse.json({contacts:[]});let u=[c],m="";""!==s&&(u.push((0,l.p)(s)),m=`AND (
        first_name ILIKE '%' || $2 || '%'
        OR last_name ILIKE '%' || $2 || '%'
        OR email     ILIKE '%' || $2 || '%'
      )`),u.push(8);let p=`$${u.length}`,E=(await i.Z.query(`SELECT id, first_name, last_name, phone, email
       FROM client_contacts
       WHERE client_id = $1
       ${m}
       ORDER BY last_name NULLS LAST, first_name NULLS LAST, id
       LIMIT ${p}`,u)).rows.map(e=>({id:e.id,firstName:e.first_name??"",lastName:e.last_name??"",phone:e.phone??"",email:e.email??""}));return r.NextResponse.json({contacts:E})}catch(e){return console.error("Error searching client contacts:",e),r.NextResponse.json({error:"Failed to search contacts"},{status:500})}}async function p(e){let t=await (0,s.nc)();if("error"in t)return t.error;let n=t.ctx;try{let t=await e.json(),a=(0,c.MM)(t);if(!(0,c.uV)(a))return r.NextResponse.json({error:"Podaj firmę i NIP"},{status:400});if(""===a.firstName.trim()&&""===a.lastName.trim())return r.NextResponse.json({error:"Podaj imię lub nazwisko"},{status:400});let s=await i.Z.connect();try{await s.query("BEGIN");let e=await (0,o.LM)(s,a,n.userId);return await s.query("COMMIT"),r.NextResponse.json({clientId:e},{status:201})}catch(e){throw await s.query("ROLLBACK"),e}finally{s.release()}}catch(e){return console.error("Error saving contact:",e),r.NextResponse.json({error:"Failed to save contact"},{status:500})}}[i,s]=u.then?(await u)():u,a()}catch(e){a(e)}})},69319:(e,t,n)=>{async function a(e,t,n){if(""!==n){let t=await e.query("SELECT id FROM clients WHERE LOWER(TRIM(nip)) = LOWER($1) ORDER BY id ASC LIMIT 1",[n]);if(t.rows.length>0)return t.rows[0].id}let a=await e.query("SELECT id FROM clients WHERE LOWER(TRIM(company)) = LOWER($1) ORDER BY id ASC LIMIT 1",[t]);return a.rows.length>0?a.rows[0].id:null}async function r(e,t,n,a){let r=n.firstName.trim(),i=n.lastName.trim();if(""===r&&""===i)return;let s=n.phone.trim(),l=n.email.trim(),o=await e.query(`SELECT id FROM client_contacts
     WHERE client_id = $1
       AND LOWER(TRIM(COALESCE(first_name, ''))) = LOWER($2)
       AND LOWER(TRIM(COALESCE(last_name,  ''))) = LOWER($3)
     ORDER BY id ASC
     LIMIT 1`,[t,r,i]);if(0===o.rows.length){await e.query(`INSERT INTO client_contacts (client_id, first_name, last_name, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,[t,r||null,i||null,s||null,l||null,a]);return}await e.query(`UPDATE client_contacts
     SET phone      = COALESCE(NULLIF(TRIM(phone), ''), $1),
         email      = COALESCE(NULLIF(TRIM(email), ''), $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,[s||null,l||null,o.rows[0].id])}async function i(e,t,n,a){let r=n.firstName.trim(),i=n.lastName.trim();if(""===r&&""===i)return;let s=n.phone.trim(),l=n.email.trim(),o=await e.query(`SELECT id FROM client_contacts
     WHERE client_id = $1
       AND LOWER(TRIM(COALESCE(first_name, ''))) = LOWER($2)
       AND LOWER(TRIM(COALESCE(last_name,  ''))) = LOWER($3)
     ORDER BY id ASC
     LIMIT 1`,[t,r,i]);if(0===o.rows.length){await e.query(`INSERT INTO client_contacts (client_id, first_name, last_name, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,[t,r||null,i||null,s||null,l||null,a]);return}await e.query(`UPDATE client_contacts
     SET phone      = $1,
         email      = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,[s||null,l||null,o.rows[0].id])}async function s(e,t,n){let i=t.company.trim(),s=t.nip.trim();if(""===i)return null;let l=t.address.trim(),o=t.sapId.trim(),c=t.firstName.trim(),u=t.lastName.trim(),m=t.phone.trim(),p=t.email.trim(),E=await a(e,i,s);if(null===E){let a=(await e.query(`INSERT INTO clients (company, nip, address, sap_id, first_name, last_name, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,[i,s||null,l||null,o||null,c||null,u||null,m||null,p||null,n])).rows[0].id;return await r(e,a,t,n),a}return await e.query(`UPDATE clients
     SET company    = COALESCE(NULLIF(TRIM(company),    ''), $1),
         nip        = COALESCE(NULLIF(TRIM(nip),        ''), $2),
         address    = COALESCE(NULLIF(TRIM(address),    ''), $3),
         sap_id     = COALESCE(NULLIF(TRIM(sap_id),     ''), $4),
         first_name = COALESCE(NULLIF(TRIM(first_name), ''), $5),
         last_name  = COALESCE(NULLIF(TRIM(last_name),  ''), $6),
         phone      = COALESCE(NULLIF(TRIM(phone),      ''), $7),
         email      = COALESCE(NULLIF(TRIM(email),      ''), $8),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $9`,[i,s||null,l||null,o||null,c||null,u||null,m||null,p||null,E]),await r(e,E,t,n),E}n.d(t,{LM:()=>s,r8:()=>a,tS:()=>i})},26409:(e,t,n)=>{n.d(t,{MM:()=>r,uV:()=>i});let a={company:"",nip:"",address:"",sapId:"",firstName:"",lastName:"",phone:"",email:""};function r(e){if(!e||"object"!=typeof e)return{...a};let t=e=>"string"==typeof e?e:"";return{company:t(e.company),nip:t(e.nip),address:t(e.address),sapId:t(e.sapId),firstName:t(e.firstName),lastName:t(e.lastName),phone:t(e.phone),email:t(e.email)}}function i(e){return""!==e.company.trim()&&""!==e.nip.trim()}},67785:(e,t,n)=>{n.d(t,{p:()=>a});function a(e){return e.replace(/[\\%_]/g,e=>`\\${e}`)}}};var t=require("../../../../webpack-runtime.js");t.C(e);var n=e=>t(t.s=e),a=t.X(0,[9276,5972,2015,727],()=>n(73906));module.exports=a})();