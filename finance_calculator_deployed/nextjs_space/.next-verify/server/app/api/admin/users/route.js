"use strict";(()=>{var e={};e.id=2628,e.ids=[2628],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},78893:e=>{e.exports=require("buffer")},84770:e=>{e.exports=require("crypto")},21764:e=>{e.exports=require("util")},8678:e=>{e.exports=import("pg")},73432:(e,r,t)=>{t.a(e,async(e,s)=>{try{t.r(r),t.d(r,{originalPathname:()=>p,patchFetch:()=>l,requestAsyncStorage:()=>_,routeModule:()=>d,serverHooks:()=>E,staticGenerationAsyncStorage:()=>f});var o=t(49303),n=t(88716),i=t(60670),a=t(25842),u=e([a]);a=(u.then?(await u)():u)[0];let d=new o.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/admin/users/route",pathname:"/api/admin/users",filename:"route",bundlePath:"app/api/admin/users/route"},resolvedPagePath:"C:\\Users\\mmazur\\source\\repos\\AMSteel_Quote\\finance_calculator_deployed\\nextjs_space\\app\\api\\admin\\users\\route.ts",nextConfigOutput:"",userland:a}),{requestAsyncStorage:_,staticGenerationAsyncStorage:f,serverHooks:E}=d,p="/api/admin/users/route";function l(){return(0,i.patchFetch)({serverHooks:E,staticGenerationAsyncStorage:f})}s()}catch(e){s(e)}})},25842:(e,r,t)=>{t.a(e,async(e,s)=>{try{t.r(r),t.d(r,{DELETE:()=>p,GET:()=>_,PATCH:()=>E,POST:()=>f});var o=t(87070),n=t(42023),i=t.n(n),a=t(9487),u=t(60727),l=t(67239),d=e([a,u]);[a,u]=d.then?(await d)():d;let c=e=>`CASE WHEN (${e}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${e})::numeric END`;async function _(){let e=await (0,u.kp)();if("error"in e)return e.error;try{let e=await a.Z.query(`WITH latest AS (
         SELECT DISTINCT ON (COALESCE(o.root_offer_id, o.id))
                o.id, o.user_id, o.client_decision, o.created_at, o.offer_data
         FROM offers o
         ORDER BY COALESCE(o.root_offer_id, o.id), o.version_number DESC, o.id DESC
       ),
       items AS (
         SELECT l.id, l.user_id, l.client_decision, l.created_at,
                ${c("it->>'tons'")}              AS tons_num,
                ${c("it->'inputs'->>'marginPct'")} AS margin_num
         FROM latest l
         LEFT JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(l.offer_data->'zestawienie') = 'array'
                THEN l.offer_data->'zestawienie' ELSE '[]'::jsonb END
         ) AS it ON true
       ),
       per_offer AS (
         SELECT id, user_id, client_decision, created_at,
                COALESCE(SUM(tons_num), 0) AS tons,
                -- Tonnage-weighted margin: only line items that carry BOTH a margin and a
                -- positive tonnage contribute, matching lib/analyticsAggregate.ts.
                COALESCE(SUM(margin_num * tons_num)
                  FILTER (WHERE margin_num IS NOT NULL AND tons_num > 0), 0) AS margin_weighted,
                COALESCE(SUM(tons_num)
                  FILTER (WHERE margin_num IS NOT NULL AND tons_num > 0), 0) AS margin_tons
         FROM items
         GROUP BY id, user_id, client_decision, created_at
       ),
       perf AS (
         SELECT user_id,
                to_char(MIN(created_at), 'YYYY-MM-DD') AS first_quote_date,
                to_char(MAX(created_at), 'YYYY-MM-DD') AS last_quote_date,
                COUNT(*) FILTER (WHERE client_decision = 'won')::int  AS offers_won,
                COUNT(*) FILTER (WHERE client_decision = 'lost')::int AS offers_lost,
                COUNT(*) FILTER (WHERE client_decision = 'pending')::int AS offers_decision_pending,
                COALESCE(SUM(tons), 0)::float AS tons_offered,
                COALESCE(SUM(tons) FILTER (WHERE client_decision = 'won'), 0)::float  AS tons_won,
                COALESCE(SUM(tons) FILTER (WHERE client_decision = 'lost'), 0)::float AS tons_lost,
                COALESCE(SUM(tons) FILTER (WHERE client_decision = 'pending'), 0)::float AS tons_pending,
                CASE WHEN SUM(margin_tons) > 0
                     THEN (SUM(margin_weighted) / SUM(margin_tons))::float
                     ELSE NULL END AS avg_margin_pct
         FROM per_offer
         GROUP BY user_id
       ),
       workflow AS (
         SELECT user_id,
                COUNT(DISTINCT COALESCE(root_offer_id, id))::int AS offers_total,
                COUNT(DISTINCT COALESCE(root_offer_id, id))
                  FILTER (WHERE status = 'pending_review')::int AS offers_pending,
                COUNT(DISTINCT COALESCE(root_offer_id, id))
                  FILTER (WHERE status = 'sent')::int AS offers_sent
         FROM offers
         GROUP BY user_id
       )
       SELECT u.id, u.email, u.full_name, u.is_superuser, u.is_active, u.created_at,
              -- Flow memberships (migration 025): one role per flow.
              COALESCE((
                SELECT json_agg(json_build_object(
                         'flowId', m.flow_id, 'flowName', f.name,
                         'roleId', m.role_id, 'roleName', r.name, 'levelCode', l.code)
                       ORDER BY f.sort_order, f.id)
                FROM user_flow_roles m
                JOIN flows f ON f.id = m.flow_id
                JOIN roles r ON r.id = m.role_id
                JOIN flow_roles fr ON fr.flow_id = m.flow_id AND fr.role_id = m.role_id
                JOIN hierarchy_levels l ON l.id = fr.level_id
                WHERE m.user_id = u.id
              ), '[]'::json) AS memberships,
              to_char(u.created_at, 'YYYY-MM-DD') AS account_created_date,
              COALESCE(w.offers_total, 0)   AS offers_total,
              COALESCE(w.offers_pending, 0) AS offers_pending,
              COALESCE(w.offers_sent, 0)    AS offers_sent,
              p.first_quote_date, p.last_quote_date,
              COALESCE(p.offers_won, 0)               AS offers_won,
              COALESCE(p.offers_lost, 0)              AS offers_lost,
              COALESCE(p.offers_decision_pending, 0)  AS offers_decision_pending,
              COALESCE(p.tons_offered, 0)  AS tons_offered,
              COALESCE(p.tons_won, 0)      AS tons_won,
              COALESCE(p.tons_lost, 0)     AS tons_lost,
              COALESCE(p.tons_pending, 0)  AS tons_pending,
              p.avg_margin_pct
       FROM users u
       LEFT JOIN workflow w ON w.user_id = u.id
       LEFT JOIN perf p ON p.user_id = u.id
       ORDER BY u.is_active DESC, u.is_superuser DESC, u.email`);return o.NextResponse.json({users:e.rows})}catch(e){return console.error("Error fetching users:",e),o.NextResponse.json({error:"Failed to fetch users"},{status:500})}}async function f(e){let r=await (0,u.kp)();if("error"in r)return r.error;try{let{email:r,password:t,full_name:s,is_superuser:n,memberships:u}=await e.json();if(!r||!t)return o.NextResponse.json({error:"Email i hasło są wymagane"},{status:400});if(t.length<l.l)return o.NextResponse.json({error:`Hasło musi mieć min. ${l.l} znak\xf3w`},{status:400});let d=function(e){if(null==e)return[];if(!Array.isArray(e))return null;let r=[];for(let t of e){let e=Number(t?.flowId),s=Number(t?.roleId);if(!Number.isInteger(e)||!Number.isInteger(s)||e<=0||s<=0)return null;r.push({flowId:e,roleId:s})}return r}(u);if(null===d)return o.NextResponse.json({error:"Nieprawidłowe przypisanie do flow"},{status:400});if((await a.Z.query("SELECT id FROM users WHERE email = $1",[r])).rows.length>0)return o.NextResponse.json({error:"Konto z tym e-mailem już istnieje"},{status:409});let _=await i().hash(t,10),f=await a.Z.connect();try{await f.query("BEGIN");let e=(await f.query(`INSERT INTO users (email, password, full_name, is_superuser, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, email, full_name, is_superuser, is_active, created_at`,[r,_,s||null,!0===n])).rows[0];for(let r of d)await f.query(`INSERT INTO user_flow_roles (user_id, flow_id, role_id) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, flow_id) DO UPDATE SET role_id = EXCLUDED.role_id`,[e.id,r.flowId,r.roleId]);return await f.query("COMMIT"),o.NextResponse.json({user:e},{status:201})}catch(e){if(await f.query("ROLLBACK"),"23503"===e.code)return o.NextResponse.json({error:"Ta rola nie istnieje w wybranym flow"},{status:400});throw e}finally{f.release()}}catch(e){return console.error("Error creating user:",e),o.NextResponse.json({error:"Failed to create user"},{status:500})}}async function E(e){let r=await (0,u.kp)();if("error"in r)return r.error;let t=r.ctx;try{let r=await e.json().catch(()=>null)??{},s=Number(r.id),{is_superuser:n,is_active:u,full_name:d,password:_}=r;if(!Number.isInteger(s)||s<=0)return o.NextResponse.json({error:"Brak id użytkownika"},{status:400});if(s===t.userId&&!1===n)return o.NextResponse.json({error:"Nie możesz zmienić własnej roli administratora"},{status:400});if(s===t.userId&&!1===u)return o.NextResponse.json({error:"Nie możesz dezaktywować własnego konta"},{status:400});let f=[],E=[],p=1;if(void 0!==n&&(f.push(`is_superuser = $${p++}`),E.push(!0===n)),void 0!==u&&"boolean"!=typeof u)return o.NextResponse.json({error:"Nieprawidłowa wartość is_active"},{status:400});if(null!=d&&"string"!=typeof d)return o.NextResponse.json({error:"Nieprawidłowe imię i nazwisko"},{status:400});if(null!=_&&""!==_&&"string"!=typeof _)return o.NextResponse.json({error:"Nieprawidłowe hasło"},{status:400});if(void 0!==u&&(f.push(`is_active = $${p++}`),E.push(u)),void 0!==d&&(f.push(`full_name = $${p++}`),E.push(d||null)),"string"==typeof _&&_){if(_.length<l.l)return o.NextResponse.json({error:`Hasło musi mieć min. ${l.l} znak\xf3w`},{status:400});f.push(`password = $${p++}`),E.push(await i().hash(_,10))}if(0===f.length)return o.NextResponse.json({error:"Brak p\xf3l do zmiany"},{status:400});E.push(s);let c=await a.Z.query(`UPDATE users SET ${f.join(", ")} WHERE id = $${p}
       RETURNING id, email, full_name, is_superuser, is_active, created_at`,E);if(0===c.rows.length)return o.NextResponse.json({error:"Nie znaleziono użytkownika"},{status:404});return o.NextResponse.json({user:c.rows[0]})}catch(e){return console.error("Error updating user:",e),o.NextResponse.json({error:"Failed to update user"},{status:500})}}async function p(e){let r=await (0,u.kp)();if("error"in r)return r.error;let t=r.ctx;try{let r=parseInt(e.nextUrl.searchParams.get("id")||"");if(!r)return o.NextResponse.json({error:"Brak id użytkownika"},{status:400});if(r===t.userId)return o.NextResponse.json({error:"Nie możesz dezaktywować własnego konta"},{status:400});let s=await a.Z.query(`UPDATE users SET is_active = false WHERE id = $1
       RETURNING id, email, full_name, is_superuser, is_active`,[r]);if(0===s.rows.length)return o.NextResponse.json({error:"Nie znaleziono użytkownika"},{status:404});return o.NextResponse.json({user:s.rows[0]})}catch(e){return console.error("Error deactivating user:",e),o.NextResponse.json({error:"Failed to deactivate user"},{status:500})}}s()}catch(e){s(e)}})},67239:(e,r,t)=>{t.d(r,{l:()=>s});let s=4}};var r=require("../../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),s=r.X(0,[9276,5972,2015,2023,727],()=>t(73432));module.exports=s})();