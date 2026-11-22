# Bank report

307 of 310 solved by the engine (2026-11-22T11:15 UTC).

| file | solved |
|---|---|
| classic.txt | 136/138 |
| openstax-calc1.txt | 82/83 |
| openstax-algebra.txt | 36/36 |
| openstax-calc2.txt | 47/47 |
| sample.txt | 6/6 |

| tag | solved |
|---|---|
| 0 times inf | 0/1 |
| trig sub | 7/8 |
| substitution | 10/11 |
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
| by parts | 34/34 |
| by parts twice | 3/3 |
| comes back | 4/4 |
| identity | 2/2 |
| odd power | 4/4 |
| even power | 1/1 |
| even powers | 1/1 |
| trick | 1/1 |
| product to sum | 2/2 |
| u-sub or trig sub | 1/1 |
| partial fractions | 7/7 |
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
| half angle | 2/2 |
| odd power bottom | 2/2 |
| exponential rational | 2/2 |
| improper | 2/2 |
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
| trig integrals | 10/10 |
| trig substitution | 9/9 |
| improper integrals | 7/7 |
| factoring | 1/1 |
| inequality | 1/1 |
| limits | 1/1 |
| product rule | 1/1 |
| definite | 1/1 |

## Failures

- **K-S5** (classic.txt:70, antideriv) `int sqrt(x^2 - 1)/x dx`: gave sqrt(1 − 1/(x^2))x − cos⁻¹(1/x) + C: its slope is not the integrand
- **K-L8** (classic.txt:105, value) `lim x->0+ x ln x`: gave −0 = 0, numbers say NaN
- **C1-5.5#283** (openstax-calc1.txt:66, antideriv) `int (y^5)/((1 - y^3 )^(3 / 2)) dy`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ y^5/((1 − y^3)^(3/2)) dy)
