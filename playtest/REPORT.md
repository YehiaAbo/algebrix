# Bank report

290 of 299 solved by the engine (2026-11-22T11:05 UTC).

| file | solved |
|---|---|
| openstax-calc2.txt | 41/47 |
| classic.txt | 125/127 |
| openstax-calc1.txt | 82/83 |
| openstax-algebra.txt | 36/36 |
| sample.txt | 6/6 |

| tag | solved |
|---|---|
| 0 times inf | 0/1 |
| trig integrals | 8/10 |
| trig sub | 5/6 |
| partial fractions | 6/7 |
| improper integrals | 6/7 |
| substitution | 10/11 |
| by parts | 31/33 |
| product | 5/5 |
| chain | 11/11 |
| quotient | 3/3 |
| log | 5/5 |
| trig | 4/4 |
| inverse trig | 2/2 |
| log differentiation | 4/4 |
| roots | 1/1 |
| exponential | 7/7 |
| log base | 2/2 |
| u-sub | 17/17 |
| arctan | 2/2 |
| linear inside | 1/1 |
| split | 1/1 |
| arcsin | 1/1 |
| by parts twice | 3/3 |
| comes back | 2/2 |
| identity | 2/2 |
| odd power | 4/4 |
| even power | 1/1 |
| even powers | 1/1 |
| trick | 1/1 |
| product to sum | 2/2 |
| u-sub or trig sub | 1/1 |
| repeated factor | 1/1 |
| long division | 2/2 |
| quadratic factor | 3/3 |
| half-angle | 1/1 |
| rule | 1/1 |
| odd part | 1/1 |
| absolute value | 4/4 |
| powers | 3/3 |
| standard | 2/2 |
| lhopital | 13/13 |
| highest power | 1/1 |
| lhopital twice | 1/1 |
| factor | 2/2 |
| conjugate | 3/3 |
| e | 1/1 |
| exponent | 1/1 |
| lhopital thrice | 1/1 |
| growth | 1/1 |
| quadratic form | 7/7 |
| quadratic in 3^x | 1/1 |
| logs | 2/2 |
| radical | 1/1 |
| extraneous | 6/6 |
| cubic | 1/1 |
| rational | 6/6 |
| quadratic in sqrt | 1/1 |
| quadratic in e^x | 1/1 |
| quadratic | 9/9 |
| factored | 1/1 |
| same base | 1/1 |
| two roots | 1/1 |
| linear | 4/4 |
| complete the square | 1/1 |
| quadratic formula | 2/2 |
| factor by grouping | 2/2 |
| radicals | 3/3 |
| logarithmic | 5/5 |
| limit laws | 5/5 |
| differentiation rules | 5/5 |
| trig derivatives | 5/5 |
| chain rule | 5/5 |
| inverse function derivatives | 3/3 |
| exp and log derivatives | 7/7 |
| antiderivatives | 3/3 |
| FTC | 10/10 |
| exp and log integrals | 15/15 |
| trig substitution | 9/9 |
| factoring | 1/1 |
| inequality | 1/1 |
| limits | 1/1 |
| product rule | 1/1 |
| definite | 1/1 |

## Failures

- **K-S5** (classic.txt:70, antideriv) `int sqrt(x^2 - 1)/x dx`: gave sqrt(1 − 1/(x^2))x − cos⁻¹(1/x) + C: its slope is not the integrand
- **K-L8** (classic.txt:105, value) `lim x->0+ x ln x`: gave −0 = 0, numbers say NaN
- **C1-5.5#283** (openstax-calc1.txt:66, antideriv) `int (y^5)/((1 - y^3 )^(3 / 2)) dy`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ y^5/((1 − y^3)^(3/2)) dy)
- **C2-3.1#23** (openstax-calc2.txt:10, antideriv) `int sin ( ln ( 2 x ) ) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at (∫ sin(ln(u)) du)/2)
- **C2-3.1#29** (openstax-calc2.txt:13, antideriv) `int cos^(-1) ( 2 x ) dx`: e stops: The engine refused this: it would not keep the equation true. (at (2x cos⁻¹(2x) − sqrt(w))/2 + C)
- **C2-3.2#89** (openstax-calc2.txt:27, antideriv) `int tan^2 x sec x dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ sin(x)^2/(cos(x)^3) dx)
- **C2-3.2#111** (openstax-calc2.txt:30, value) `int_(0)^(pi / 2) sqrt(1 - cos ( 2 x )) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at (∫_{0}^{π} sqrt(1 − cos(u)) du)/2)
- **C2-3.4#219** (openstax-calc2.txt:40, antideriv) `int (dt)/(( e^t - e^(- t) )^2)`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/((e^t − e^(−t))^2) dt)
- **C2-3.7#393** (openstax-calc2.txt:49, value) `int_(2)^(inf) (dx)/((x^2 - 1)^(3 / 2))`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{2}^{∞} 1/((x^2 − 1)^(3/2)) dx)
