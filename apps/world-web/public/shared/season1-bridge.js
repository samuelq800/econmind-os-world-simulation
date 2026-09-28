import {Money} from './season1-numeric/numeric/money.js';
import {Quantity} from './season1-numeric/numeric/quantity.js';
import {Price} from './season1-numeric/numeric/price.js';
import {Rate} from './season1-numeric/numeric/rate.js';
import {SimTime} from './season1-numeric/numeric/sim-time.js';
import {WorldDecimal as D,canonicalDecimal} from './season1-numeric/numeric/world-decimal.js';
const canonical=x=>canonicalDecimal(new D(String(x)));
window.Season1=Object.freeze({Money,Quantity,Price,Rate,SimTime,D,canonical,sourceSHA:'b38420d845fa921d3c6e64a9ce72b00a578c3db1',daysPerYear:360,
 moneyMinor:(n,currency='LNY')=>Money.from(canonical(new D(String(n)).div(100)),currency).toCanonicalValue(),
 moneyMillion:(n,currency='LNY')=>Money.from(canonical(new D(String(n)).times(1000000)),currency).toCanonicalValue(),
 quantity:(n,unit)=>Quantity.from(canonical(n),unit).toCanonicalValue(),
 ratio:n=>({amount:Rate.from(canonical(new D(String(n)).div(100))).toCanonicalValue(),unit:'ratio'}),
 simDay:n=>({amount:SimTime.fromTicks((BigInt(n)*86400000n).toString()).toCanonicalValue(),unit:'sim_millisecond'}),
 interestMinor:(principal,bp,days)=>new D(String(principal)).times(String(bp)).times(String(days)).div(10000).div(360).toDecimalPlaces(0,D.ROUND_HALF_EVEN).toNumber()
});
document.dispatchEvent(new Event('season1-ready'));
