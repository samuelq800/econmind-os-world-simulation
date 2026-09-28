'use strict';
(() => {
 const query=new URLSearchParams(location.search),country=document.body.dataset.country,role=['captain','finance','central_bank','industry','trade','social'].includes(query.get('role'))?query.get('role'):'finance';
 const base=new URL('.',document.currentScript.src);
 if(query.get('view')==='atlas'){const script=document.createElement('script');script.src=new URL('countries.js',base);document.body.append(script);return;}
 location.replace(new URL(`../?role=${role}&country=${country}#country`,base).href);
})();
