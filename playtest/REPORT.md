# Bank report

274 of 293 solved by the engine (2026-11-21T05:23 UTC).

| file | solved |
|---|---|
| openstax-calc2.txt | 39/47 |
| openstax-calc1.txt | 78/83 |
| classic.txt | 115/121 |
| openstax-algebra.txt | 36/36 |
| sample.txt | 6/6 |

| tag | solved |
|---|---|
| quadratic factor | 0/2 |
| 0 times inf | 0/1 |
| sin ( 3 x ) + cos ( 3 x ) | 0/1 |
| improper integrals | 4/7 |
| absolute value | 2/3 |
| log | 4/5 |
| trig integrals | 8/10 |
| trig sub | 5/6 |
| partial fractions | 6/7 |
| exp and log integrals | 12/14 |
| substitution | 10/11 |
| lhopital | 12/13 |
| by parts | 31/33 |
| u-sub | 16/17 |
| product | 5/5 |
| chain | 11/11 |
| quotient | 3/3 |
| trig | 4/4 |
| inverse trig | 2/2 |
| log differentiation | 4/4 |
| roots | 1/1 |
| exponential | 7/7 |
| log base | 1/1 |
| arctan | 2/2 |
| linear inside | 1/1 |
| split | 1/1 |
| arcsin | 1/1 |
| by parts twice | 2/2 |
| comes back | 2/2 |
| identity | 2/2 |
| odd power | 3/3 |
| even power | 1/1 |
| even powers | 1/1 |
| trick | 1/1 |
| product to sum | 2/2 |
| u-sub or trig sub | 1/1 |
| repeated factor | 1/1 |
| long division | 2/2 |
| half-angle | 1/1 |
| rule | 1/1 |
| odd part | 1/1 |
| powers | 3/3 |
| standard | 2/2 |
| highest power | 1/1 |
| lhopital twice | 1/1 |
| factor | 2/2 |
| conjugate | 2/2 |
| e | 1/1 |
| exponent | 1/1 |
| lhopital thrice | 1/1 |
| growth | 1/1 |
| quadratic form | 7/7 |
| quadratic in 3^x | 1/1 |
| logs | 2/2 |
| radical | 1/1 |
| extraneous | 5/5 |
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
| trig substitution | 9/9 |
| factoring | 1/1 |
| inequality | 1/1 |
| limits | 1/1 |
| product rule | 1/1 |
| definite | 1/1 |

## Failures

- **K-I15** (classic.txt:40, antideriv) `int (x + 1)/(x^2 + 2x + 5) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ x/(x^2 + 2x + 5) dx + tan⁻¹((x + 1)/2)/2)
- **K-S5** (classic.txt:70, antideriv) `int sqrt(x^2 - 1)/x dx`: gave sqrt(1 − 1/(x^2))x − cos⁻¹(1/x) + C: its slope is not the integrand
- **K-F5** (classic.txt:77, antideriv) `int 1/(x^3 + x) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/(x^3 + x) dx)
- **K-F6** (classic.txt:78, antideriv) `int (2x^2 + 3)/(x (x^2 + 1)) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ln|u| + ∫ 3/(x(x^2 + 1)) dx)
- **K-V11** (classic.txt:92, value) `int_(0)^(2) abs(x - 1) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{0}^{2} |x − 1| dx)
- **K-L8** (classic.txt:105, value) `lim x->0+ x ln x`: gave −0 = 0, numbers say NaN
- **C1-4.8#391** (openstax-calc1.txt:45, value) `lim x->inf x e^(1 / x)`: e stops: You can't plug in ∞ here. Try L'Hôpital (C + l), or divide top and bottom by the highest power (Tab). (at lim_{x→∞} xe^(1/x))
- **C1-5.5#283** (openstax-calc1.txt:66, antideriv) `int (y^5)/((1 - y^3 )^(3 / 2)) dy`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ y^5/((1 − y^3)^(3/2)) dy)
- **C1-5.6#349** (openstax-calc1.txt:82, antideriv) `int (sin ( 3 x ) - cos ( 3 x ))/(sin ( 3 x ) + cos ( 3 x )) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ sin(u)/(3(sin(u) + cos(u))) du + ∫ −cos(u)/(3(sin(u) + cos(u))) du)
- **C1-5.6#355** (openstax-calc1.txt:84, value) `int_(1)^(2) (1 + 2 x + x^2)/(3 x + 3 x^2 + x^3) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{1}^{2} 1/(3x + 3x^2 + x^3) dx + ∫_{1}^{2} 2x/(3x + 3x^2 + x^3) dx + ∫_{1}^{2} x^2/(3x + 3x^2 + x^3) dx)
- **C1-5.6#357** (openstax-calc1.txt:85, value) `int_(0)^(pi / 3) (sin x - cos x)/(sin x + cos x) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{0}^{π/3} sin(x)/(sin(x) + cos(x)) dx + ∫_{0}^{π/3} −cos(x)/(sin(x) + cos(x)) dx)
- **C2-3.1#23** (openstax-calc2.txt:10, antideriv) `int sin ( ln ( 2 x ) ) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at (∫ sin(ln(u)) du)/2)
- **C2-3.1#29** (openstax-calc2.txt:13, antideriv) `int cos^(-1) ( 2 x ) dx`: e stops: The engine refused this: it would not keep the equation true. (at (2x cos⁻¹(2x) − sqrt(w))/2 + C)
- **C2-3.2#89** (openstax-calc2.txt:27, antideriv) `int tan^2 x sec x dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ sin(x)^2/(cos(x)^3) dx)
- **C2-3.2#111** (openstax-calc2.txt:30, value) `int_(0)^(pi / 2) sqrt(1 - cos ( 2 x )) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at (∫_{0}^{π} sqrt(1 − cos(u)) du)/2)
- **C2-3.4#219** (openstax-calc2.txt:40, antideriv) `int (dt)/(( e^t - e^(- t) )^2)`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/((e^t − e^(−t))^2) dt)
- **C2-3.7#359** (openstax-calc2.txt:45, value) `int_(-inf)^(inf) (1)/(x^2 + 1) dx`: e stops: You can't plug in ∞ here. Try L'Hôpital (C + l), or divide top and bottom by the highest power (Tab). (at lim_{x→∞} tan⁻¹(x) − lim_{x→−∞} tan⁻¹(x))
- **C2-3.7#389** (openstax-calc2.txt:48, value) `int_(0)^(4) x ln ( 4 x ) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{0}^{4} x ln(4x) dx)
- **C2-3.7#393** (openstax-calc2.txt:49, value) `int_(2)^(inf) (dx)/((x^2 - 1)^(3 / 2))`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{2}^{∞} 1/((x^2 − 1)^(3/2)) dx)
