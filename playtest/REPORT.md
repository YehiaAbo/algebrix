# Bank report

132 of 172 solved by the engine (2026-11-21T04:41 UTC).

| file | solved |
|---|---|
| openstax-calc2.txt | 23/47 |
| openstax-algebra.txt | 29/36 |
| openstax-calc1.txt | 74/83 |
| sample.txt | 6/6 |

| tag | solved |
|---|---|
| sin ( 3 x ) + cos ( 3 x ) | 0/1 |
| partial fractions | 0/3 |
| trig substitution | 1/9 |
| quadratic form | 1/5 |
| improper integrals | 2/7 |
| exponential | 2/5 |
| trig integrals | 5/10 |
| radicals | 2/3 |
| FTC | 7/10 |
| extraneous | 3/4 |
| exp and log integrals | 11/14 |
| logarithmic | 4/5 |
| by parts | 16/19 |
| lhopital | 10/11 |
| substitution | 10/11 |
| linear | 4/4 |
| rational | 4/4 |
| quadratic | 7/7 |
| complete the square | 1/1 |
| quadratic formula | 2/2 |
| powers | 2/2 |
| factor by grouping | 2/2 |
| limit laws | 5/5 |
| differentiation rules | 5/5 |
| trig derivatives | 5/5 |
| chain rule | 5/5 |
| inverse function derivatives | 3/3 |
| exp and log derivatives | 7/7 |
| log differentiation | 3/3 |
| antiderivatives | 3/3 |
| factoring | 1/1 |
| inequality | 1/1 |
| limits | 1/1 |
| product rule | 1/1 |
| definite | 1/1 |

## Failures

- **CA-2.6#11** (openstax-algebra.txt:20, solve) `x^((2)/(3)) - 5x^((1)/(3)) + 6 = 0`: e stops: stuck
- **CA-2.6#27** (openstax-algebra.txt:25, solve) `sqrt(3x + 7) + sqrt(x + 2) = 1`: e stops: I can't isolate x here yet. Try factoring or another form.
- **CA-2.6#39** (openstax-algebra.txt:27, solve) `(x^2 - 1 )^2 + ( x^2 - 1 ) - 12 = 0`: e stops: This quadratic has no real solutions.
- **CA-6.6#7** (openstax-algebra.txt:29, solve:n) `2^(- 3n) (1)/(4) = 2^(n + 2)`: e stops: stuck
- **CA-6.6#21** (openstax-algebra.txt:32, solve) `e^(2x) - e^x - 132 = 0`: e stops: stuck
- **CA-6.6#27** (openstax-algebra.txt:33, solve) `e^(2x) - e^x - 6 = 0`: e stops: stuck
- **CA-6.6#61** (openstax-algebra.txt:38, solve) `log_9 ( 3 - x ) = log_9 ( 4x - 8 )`: e stops: stuck
- **C1-4.8#391** (openstax-calc1.txt:45, value) `lim x->inf x e^(1 / x)`: e stops: You can't plug in ∞ here. Try L'Hôpital (C + l), or divide top and bottom by the highest power (Tab). (at lim_{x→∞} xe^(1/x))
- **C1-5.3#173** (openstax-calc1.txt:51, value) `int_(2)^(3) ( t^2 - 9 ) ( 4 - t^2 ) dt`: e stops: By parts keeps going without the integral getting simpler. Try another u (aim at it, then C + b). (at 80/3 − 2(17/6 − (17/3 − 2(17/6 − (∫_{2}^{3} t^2(4 − t^2) dt)/2))/2))
- **C1-5.3#185** (openstax-calc1.txt:57, value) `int_(0)^(pi / 4) sec θ tan θ dθ`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at −ln(sqrt(2)/2) sqrt(2) − ∫_{1}^{sqrt(2)/2} −ln|u|/(−u^2) du)
- **C1-5.3#187** (openstax-calc1.txt:58, value) `int_(pi / 4)^(pi / 2) csc^2 θ dθ`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{π/4}^{π/2} (1/sin(θ))^2 dθ)
- **C1-5.5#283** (openstax-calc1.txt:66, antideriv) `int (y^5)/((1 - y^3 )^(3 / 2)) dy`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ y^5/((1 − y^3)^(3/2)) dy)
- **C1-5.6#349** (openstax-calc1.txt:82, antideriv) `int (sin ( 3 x ) - cos ( 3 x ))/(sin ( 3 x ) + cos ( 3 x )) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ sin(u)/(3(sin(u) + cos(u))) du + ∫ −cos(u)/(3(sin(u) + cos(u))) du)
- **C1-5.6#353** (openstax-calc1.txt:83, antideriv) `int ln ( csc x ) cot x dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ ln(1/sin(x))(1/tan(x)) dx)
- **C1-5.6#355** (openstax-calc1.txt:84, value) `int_(1)^(2) (1 + 2 x + x^2)/(3 x + 3 x^2 + x^3) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{1}^{2} 1/(3x + 3x^2 + x^3) dx + ∫_{1}^{2} 2x/(3x + 3x^2 + x^3) dx + ∫_{1}^{2} x^2/(3x + 3x^2 + x^3) dx)
- **C1-5.6#357** (openstax-calc1.txt:85, value) `int_(0)^(pi / 3) (sin x - cos x)/(sin x + cos x) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{0}^{π/3} sin(x)/(sin(x) + cos(x)) dx + ∫_{0}^{π/3} −cos(x)/(sin(x) + cos(x)) dx)
- **C2-3.1#23** (openstax-calc2.txt:10, antideriv) `int sin ( ln ( 2 x ) ) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at (∫ sin(ln(u)) du)/2)
- **C2-3.1#25** (openstax-calc2.txt:11, antideriv) `int (ln x )^2 dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ ln(x)^2 dx)
- **C2-3.1#29** (openstax-calc2.txt:13, antideriv) `int cos^(-1) ( 2 x ) dx`: e stops: The engine refused this: it would not keep the equation true. (at (2x cos⁻¹(2x) − (−2 sqrt(w)/(−2)))/2 + C)
- **C2-3.2#79** (openstax-calc2.txt:23, antideriv) `int sin^3 x dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ sin(x)^3 dx)
- **C2-3.2#83** (openstax-calc2.txt:24, antideriv) `int sin^5 x cos^2 x dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at sin(x)^5(x/2 + sin(2x)/4) − 5((∫ sin(x)^4 cos(x)x dx)/2 + ∫ sin(x)^4 cos(x) sin(2x)/4 dx))
- **C2-3.2#87** (openstax-calc2.txt:26, antideriv) `int sec x tan x dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at −(1/cos(x)) ln|cos(x)| − ∫ −ln|u|/(−u^2) du)
- **C2-3.2#89** (openstax-calc2.txt:27, antideriv) `int tan^2 x sec x dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ tan(x)^2(1/cos(x)) dx)
- **C2-3.2#111** (openstax-calc2.txt:30, value) `int_(0)^(pi / 2) sqrt(1 - cos ( 2 x )) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at (∫_{0}^{π} sqrt(1 − cos(u)) du)/2)
- **C2-3.3#139** (openstax-calc2.txt:31, antideriv) `int (dx)/(x^2 sqrt(1 - x^2))`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/(x^2 sqrt(1 − x^2)) dx)
- **C2-3.3#143** (openstax-calc2.txt:32, antideriv) `int (θ^3 dθ)/(sqrt(9 - θ^2))`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ θ^3/sqrt(9 − θ^2) dθ)
- **C2-3.3#147** (openstax-calc2.txt:33, antideriv) `int (dx)/((x^2 - 9 )^(3 / 2))`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/((x^2 − 9)^(3/2)) dx)
- **C2-3.3#151** (openstax-calc2.txt:34, antideriv) `int (dx)/(x^2 sqrt(x^2 + 1))`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/(x^2 sqrt(x^2 + 1)) dx)
- **C2-3.3#153** (openstax-calc2.txt:35, antideriv) `int (1 - x^2 )^(3 / 2) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ (1 − x^2)^(3/2) dx)
- **C2-3.3#163** (openstax-calc2.txt:37, antideriv) `int (1)/(sqrt(- x^2 + 10 x)) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/sqrt(−x^2 + 10x) dx)
- **C2-3.3#165** (openstax-calc2.txt:38, value) `int_(-3)^(3) sqrt(9 - x^2) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{−3}^{3} sqrt(9 − x^2) dx)
- **C2-3.4#201** (openstax-calc2.txt:39, antideriv) `int (2 x^2 + 4 x + 22)/(x^2 + 2 x + 10) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at 2x + ∫ 2/(x^2 + 2x + 10) dx)
- **C2-3.4#219** (openstax-calc2.txt:40, antideriv) `int (dt)/(( e^t - e^(- t) )^2)`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/((e^t − e^(−t))^2) dt)
- **C2-3.4#225** (openstax-calc2.txt:41, value) `int_(1)^(2) (1)/(x^2 sqrt(4 - x^2)) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{1}^{2} 1/(x^2 sqrt(4 − x^2)) dx)
- **C2-3.4#227** (openstax-calc2.txt:42, antideriv) `int (1)/(1 + e^x) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫ 1/(1 + e^x) dx)
- **C2-3.7#349** (openstax-calc2.txt:43, value) `int_(0)^(2) (1)/(sqrt(4 - x^2)) dx`: e stops: The engine refused this: it would not keep the equation true. (at ∫_{0}^{2} 1/sqrt(4 − x^2) dx)
- **C2-3.7#359** (openstax-calc2.txt:45, value) `int_(-inf)^(inf) (1)/(x^2 + 1) dx`: e stops: You can't plug in ∞ here. Try L'Hôpital (C + l), or divide top and bottom by the highest power (Tab). (at lim_{x→∞} tan⁻¹(x) − lim_{x→−∞} tan⁻¹(x))
- **C2-3.7#387** (openstax-calc2.txt:47, value) `int_(0)^(3) (dx)/(sqrt(9 - x^2))`: e stops: The engine refused this: it would not keep the equation true. (at ∫_{0}^{3} 1/sqrt(9 − x^2) dx)
- **C2-3.7#389** (openstax-calc2.txt:48, value) `int_(0)^(4) x ln ( 4 x ) dx`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{0}^{4} x ln(4x) dx)
- **C2-3.7#393** (openstax-calc2.txt:49, value) `int_(2)^(inf) (dx)/((x^2 - 1)^(3 / 2))`: e stops: No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions). (at ∫_{2}^{∞} 1/((x^2 − 1)^(3/2)) dx)
