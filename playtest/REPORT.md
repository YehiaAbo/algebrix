# Bank report

125 of 127 solved by the engine (2026-11-22T10:15 UTC).

| file | solved |
|---|---|
| classic.txt | 125/127 |

| tag | solved |
|---|---|
| 0 times inf | 0/1 |
| trig sub | 5/6 |
| product | 5/5 |
| chain | 11/11 |
| quotient | 3/3 |
| log | 5/5 |
| trig | 4/4 |
| inverse trig | 2/2 |
| log differentiation | 1/1 |
| roots | 1/1 |
| exponential | 2/2 |
| log base | 2/2 |
| u-sub | 17/17 |
| arctan | 2/2 |
| linear inside | 1/1 |
| split | 1/1 |
| arcsin | 1/1 |
| by parts | 14/14 |
| by parts twice | 3/3 |
| comes back | 2/2 |
| identity | 2/2 |
| odd power | 4/4 |
| even power | 1/1 |
| even powers | 1/1 |
| trick | 1/1 |
| product to sum | 2/2 |
| u-sub or trig sub | 1/1 |
| partial fractions | 4/4 |
| repeated factor | 1/1 |
| long division | 2/2 |
| quadratic factor | 3/3 |
| half-angle | 1/1 |
| rule | 1/1 |
| odd part | 1/1 |
| absolute value | 4/4 |
| powers | 1/1 |
| standard | 2/2 |
| lhopital | 2/2 |
| highest power | 1/1 |
| lhopital twice | 1/1 |
| factor | 2/2 |
| conjugate | 3/3 |
| e | 1/1 |
| exponent | 1/1 |
| lhopital thrice | 1/1 |
| growth | 1/1 |
| quadratic form | 2/2 |
| quadratic in 3^x | 1/1 |
| logs | 2/2 |
| radical | 1/1 |
| extraneous | 2/2 |
| cubic | 1/1 |
| rational | 2/2 |
| quadratic in sqrt | 1/1 |
| quadratic in e^x | 1/1 |
| quadratic | 2/2 |
| factored | 1/1 |
| same base | 1/1 |
| two roots | 1/1 |

## Failures

- **K-S5** (classic.txt:70, antideriv) `int sqrt(x^2 - 1)/x dx`: gave sqrt(1 − 1/(x^2))x − cos⁻¹(1/x) + C: its slope is not the integrand
- **K-L8** (classic.txt:105, value) `lim x->0+ x ln x`: gave −0 = 0, numbers say NaN
