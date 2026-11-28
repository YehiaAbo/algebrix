# Player report (hands)

2026-11-28T02:00Z, 344 problems in 2079 s: **178 finished**, 0 wrong, 166 stuck. Budget 40 expansions, 60 s each.

## Failures by signature

### clumsy (shortcut only): ∫ of frac | e does it, by hand not found (13)

Problems: K-I8, K-I11, K-S4, K-H13, K-H21, H-I9, C1-5.6#329, C1-5.6#331, C1-5.6#353, C1-5.6#349, C2-3.2#75, C2-3.2#87, C2-3.2#89

Example K-I8: `F = int 1/(x ln x) dx` reached `F = int 1/(x ln x) dx` by nothing

### clumsy (shortcut only): ∫ of mul | e does it, by hand not found (8)

Problems: K-T2, K-P11, K-T5, K-T10, K-H2, C1-5.5#279, C1-5.5#281, C1-5.5#287

Example K-T2: `F = int sin(x)^2 cos(x)^3 dx` reached `F = int sin(x)^2 cos(x)^3 dx` by nothing

### clumsy (shortcut only): deriv | e does it, by hand not found (5)

Problems: K-D10, K-D18, K-D15, C1-3.9#335, C1-3.9#353

Example K-D10: `y = d/dx(sin(x)^3 cos(x)^2)` reached `y = d/dx(sin(x)^3 cos(x)^2)` by nothing

### general gap: ∫ of frac | e: does nothing (4)

Problems: K-I7, K-H12, K-H18, C1-5.5#283

Example K-I7: `F = int e^x/(1 + e^(2x)) dx` reached `F = ∫ 1/(e^(−x) + e^x) dx` by Shift+ArrowDown @1.0.0 → Tab expanded @1

### clumsy (shortcut only): ∫ of pow | e does it, by hand not found (4)

Problems: K-S2, K-H10, H-A5, C2-3.3#153

Example K-S2: `F = int 1/(x^2 + 9)^(3/2) dx` reached `F = ∫ (sqrt(x^2 + 9))^(−3) dx` by Tab as a power of a power @1.0.1 → Tab as roots @1.0.1.0 → Tab as powers @1.0

### clumsy (shortcut only): lim of frac | e does it, by hand not found (4)

Problems: K-L1, H-L8, C1-4.8#369, C1-4.8#375

Example K-L1: `L = lim x->0 sin(3x)/x` reached `L = lim x->0 sin(3x)/x` by nothing

### clumsy (shortcut only): lim of mul | e does it, by hand not found (2)

Problems: H-L6, C1-4.8#383

Example H-L6: `L = lim x->inf x (e^(1/x) - 1)` reached `L = lim x->inf x (e^(1/x) - 1)` by nothing

### general gap: x not alone (pow = num) | e: gets further (2)

Problems: CA-6.6#21, CA-6.6#27

Example CA-6.6#21: `e^(2x) - e^x - 132 = 0` reached `e^x = −11` by Tab solve for x @0

### clumsy (shortcut only): ∫ of sqrt | e does it, by hand not found (1)

Problems: K-S3

Example K-S3: `F = int sqrt(1 - 4x^2) dx` reached `F = ∫ sqrt(1 − 4xx) dx` by Tab one factor out @1.0.0.1.1

### general gap: ∫ of mul | e: does nothing (1)

Problems: K-S6

Example K-S6: `F = int x^3 sqrt(1 - x^2) dx` reached `F = int x^3 sqrt(1 - x^2) dx` by nothing

### clumsy (shortcut only): ∫ of fn | e does it, by hand not found (1)

Problems: K-H4

Example K-H4: `L = int_0^2 abs(x^2 - 1) dx` reached `L = int_0^2 abs(x^2 - 1) dx` by nothing

### clumsy (shortcut only): lim of add | e does it, by hand not found (1)

Problems: H-L7

Example H-L7: `L = lim x->0 (1/x - 1/sin(x))` reached `L = lim x->0 (1/x - 1/sin(x))` by nothing

### general gap: ∫ of pow | e: does nothing (1)

Problems: H-A2

Example H-A2: `F = int e^(sqrt(x)) dx` reached `F = int e^(sqrt(x)) dx` by nothing

### general gap: ∫ of pow | e: gets further (1)

Problems: C2-3.3#147

Example C2-3.3#147: `F = int ((1)/((x^2 - 9 )^(3 / 2))) dx` reached `F = ∫ (sqrt(x^2 − 9))^(−3) dx` by Tab as a power of a power @1.0.1 → Tab as roots @1.0.1.0 → Tab as powers @1.0

### general gap: ∫ of frac | e: gets further (1)

Problems: C2-3.3#151

Example C2-3.3#151: `F = int ((1)/(x^2 sqrt(x^2 + 1))) dx` reached `F = ∫ x^(−2)/sqrt(x^2 + 1) dx` by Shift+ArrowUp @1.0.1.0

### general gap: x not alone (fn = num) | e: does nothing (1)

Problems: s2

Example s2: `x^2 <= 4` reached `|x| ≤ 2` by f inverse @0 → s @1

### slow: letters left | e does it, by hand not found (103)

Problems: K-D12, K-D2, K-D13, K-D14, K-I2, K-I3, K-I4, K-I5, K-I6, K-I12, K-I15, K-P2, K-P4, K-P5, K-P8, K-P12, K-T4, K-T3, K-T6, K-T8, K-T9, K-S1, K-F5, K-F6, K-F7, K-V3, K-V1, K-V4, K-V5, K-V6, K-V8, K-V11, K-V13, K-V14, K-V15, K-L7, K-H7, K-H3, K-H6, K-H8, K-H14, K-H16, K-H15, K-H17, H-L1, H-L2, H-L3, H-I1, H-I3, H-I4, H-I2, H-I5, H-I7, H-I8, H-A1, H-A9, H-A7, H-A8, C1-3.3#111, C1-3.6#237, C1-3.9#347, C1-3.9#351, C1-4.8#395, C1-5.3#185, C1-5.3#173, C1-5.5#275, C1-5.5#271, C1-5.5#277, C1-5.5#293, C1-5.5#297, C1-5.5#295, C1-5.6#333, C1-5.6#339, C1-5.6#335, C1-5.6#337, C1-5.6#343, C1-5.6#355, C1-5.6#357, C2-3.1#9, C2-3.1#11, C2-3.1#15, C2-3.1#17, C2-3.1#19, C2-3.1#21, C2-3.1#23, C2-3.1#25, C2-3.1#31, C2-3.1#33, C2-3.1#37, C2-3.1#39, C2-3.1#43, C2-3.1#45, C2-3.2#83, C2-3.2#73, C2-3.3#139, C2-3.2#85, C2-3.2#111, C2-3.3#165, C2-3.4#225, C2-3.7#389, C2-3.7#359, C2-3.7#351, C2-3.7#393

Example K-D12: `y = d/dx(ln(sec x + tan x))` reached `y = u/(1/cos(x) + tan(x))` by Tab chain rule (ln) @1 → b name it @1.1 → Tab solve for y @0

### slow: letters left | e: does nothing (11)

Problems: K-P6, K-P9, K-P10, K-S5, K-H9, K-H20, K-H19, C2-3.1#29, C2-3.3#143, C2-3.4#227, C2-3.4#219

Example K-P6: `F = int x^3 e^(x^2) dx` reached `F = w/4` by Tab by parts: u = e^(x^2) @1 → b name it @1.1 → Tab one fraction @1 → b name it @1.0

### slow: sum | e does it, by hand not found (2)

Problems: H-S1, H-S3

Example H-S1: `L = sum_{n=1}^∞ 1/(n(n+1))` reached `L = sum_{n=1}^∞ 1/(n(n+1))` by nothing

## Finished

- K-D1: 1 steps (Tab product rule @1)
- K-D3: 1 steps (Tab quotient rule @1)
- K-D5: 1 steps (Tab chain rule (ln) @1)
- K-D4: 1 steps (Tab chain rule (√) @1)
- K-D7: 1 steps (Tab chain rule (tan⁻¹) @1)
- K-D6: 1 steps (Tab chain rule (tan) @1)
- K-D9: 2 steps (Tab logarithmic differentiation @1 → Tab product rule @1.1)
- K-D11: 1 steps (Tab chain rule (eᵘ) @1)
- K-D8: 2 steps (Shift+ArrowUp @1.0.0.1 → Tab chain rule (sin⁻¹) @1)
- K-D16: 1 steps (Tab chain rule (power) @1)
- K-D17: 1 steps (Tab chain rule (sin) @1)
- K-D19: 2 steps (Tab product rule @1 → Tab exponential rule @1.0.1)
- K-D20: 2 steps (Tab constant multiple @1 → Tab chain rule (ln) @1.0)
- K-I1: 2 steps (Tab expanded @1 → Tab sum rule, + C @1)
- K-I9: 1 steps (Tab ∫ sin = −cos, + C @1)
- K-I10: 2 steps (Tab long division @1 → Tab sum rule, + C @1)
- K-I13: 1 steps (Tab ∫ 1/(4 + x²) = tan⁻¹, + C @1)
- K-I14: 1 steps (Tab ∫ 1/√(16 − x²) = sin⁻¹, + C @1)
- K-P1: 2 steps (Tab by parts: u = x @1 → Tab ∫ eˣ = eˣ, + C @1.1.0)
- K-P3: 2 steps (Tab by parts: u = ln(x) @1 → Tab constant multiple, + C @1.1.0)
- K-P7: 2 steps (Tab by parts: u = x @1 → Tab ∫ tan = −ln|cos|, + C @1.1.0)
- K-T1: 2 steps (Tab trig: power reduction @1.0 → Tab constant multiple, + C @1)
- K-T7: 1 steps (Tab ∫ sec = ln|sec + tan|, + C @1)
- K-F2: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- K-F1: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- K-F4: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- K-F3: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- K-F8: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- K-V2: 2 steps (Tab half-angle: sin² = (1 − cos 2θ)/2 @1 → Tab plug in the bounds @1)
- K-V7: 3 steps (Tab partial fractions @1 → Tab sum rule @1 → Tab plug in the bounds @1)
- K-V9: 2 steps (Tab ∫ tan = −ln|cos| @1 → Tab plug in the bounds @1)
- K-V10: 2 steps (Tab sum rule @1 → Tab plug in the bounds @1)
- K-V12: 2 steps (Tab sum rule @1 → Tab plug in the bounds @1)
- K-L2: 3 steps (Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- K-L3: 3 steps (Tab L'Hôpital (∞/∞) @1 → Tab L'Hôpital (∞/∞) @1 → Tab x → ∞ @1)
- K-L5: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = 2 @1)
- K-L4: 3 steps (Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- K-L6: 3 steps (C times the conjugate @1 → s @1 → Tab plug in x = 0 @1)
- K-L10: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- K-L11: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = 1 @1)
- K-L8: 5 steps (C 0·∞ as a fraction @1 → Tab as powers @1.1.1 → Tab L'Hôpital (∞/∞) @1 → s @1 → Tab plug in x = 0 @1)
- K-L9: 4 steps (C power down: e^(g ln f) @1 → s @1.1 → Tab L'Hôpital (∞/∞) @1.1 → Tab x → ∞ @1.1)
- K-L14: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = 3 @1)
- K-L15: 2 steps (Tab L'Hôpital (∞/∞) @1 → Tab x → ∞ @1)
- K-E1: 1 steps (Tab solve for x @0)
- K-E2: 1 steps (Tab solve for x @0)
- K-E3: 1 steps (Tab solve for x @0)
- K-E4: 1 steps (Tab solve for x @0)
- K-E5: 1 steps (Tab solve for x @0)
- K-E6: 1 steps (Tab solve for x @0)
- K-E7: 1 steps (Tab solve for x @0)
- K-E8: 1 steps (Tab solve for x @0)
- K-E9: 1 steps (Tab solve for x @0)
- K-E10: 1 steps (Tab solve for x @0)
- K-E11: 1 steps (Tab solve for x @0)
- K-E12: 1 steps (Tab solve for x @0)
- K-E13: 1 steps (Tab solve for x @0)
- K-E14: 1 steps (Tab solve for x @0)
- K-E15: 1 steps (Tab solve for x @0)
- K-E16: 1 steps (Tab solve for x @0)
- K-E17: 1 steps (Tab solve for x @0)
- K-E18: 1 steps (Tab solve for x @0)
- K-E19: 1 steps (Tab solve for x @0)
- K-E20: 1 steps (Tab solve for x @0)
- K-H1: 1 steps (Tab solve for x @0)
- K-L12: 3 steps (C times the conjugate @1 → C top and bottom ÷ x @1 → Tab x → ∞ @1)
- K-L13: 4 steps (Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- K-H5: 3 steps (C times the conjugate @1 → C top and bottom ÷ x @1 → Tab x → ∞ @1)
- K-H11: 3 steps (Tab trig: Pythagorean @1.0.0 → Tab split into terms @1.0 → Tab sum rule, + C @1)
- H-L5: 3 steps (Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- H-L4: 4 steps (Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- H-L9: 4 steps (C power down: e^(g ln f) @1 → s @1.1 → Tab L'Hôpital (∞/∞) @1.1 → Tab x → ∞ @1.1)
- H-I6: 2 steps (Tab ∫ 1/√(4 − (x − 2)²) = sin⁻¹, the square completed @1 → Tab plug in the bounds @1)
- H-S2: 1 steps (Tab geometric series, r = 2/3 @1)
- H-A3: 1 steps (Tab ∫ 1/(9 + (x + 2)²) = tan⁻¹, the square completed, + C @1)
- H-A4: 2 steps (Tab by parts: u = x @1 → Tab ∫ tan = −ln|cos|, + C @1.1.0)
- H-A6: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- CA-2.2#9: 1 steps (Tab solve for x @0)
- CA-2.2#11: 1 steps (Tab solve for x @0)
- CA-2.2#13: 1 steps (Tab solve for x @0)
- CA-2.2#15: 1 steps (Tab solve for x @0)
- CA-2.2#17: 1 steps (Tab solve for x @0)
- CA-2.2#19: 1 steps (Tab solve for x @0)
- CA-2.2#21: 1 steps (Tab solve for x @0)
- CA-2.5#7: 1 steps (Tab solve for x @0)
- CA-2.5#19: 1 steps (Tab solve for x @0)
- CA-2.5#21: 1 steps (Tab solve for x @0)
- CA-2.5#25: 1 steps (Tab solve for x @0)
- CA-2.5#27: 1 steps (Tab solve for x @0)
- CA-2.5#29: 1 steps (Tab solve for z @0)
- CA-2.5#39: 1 steps (Tab solve for x @0)
- CA-2.5#43: 1 steps (Tab solve for x @0)
- CA-2.6#7: 1 steps (Tab solve for x @0)
- CA-2.6#9: 1 steps (Tab solve for x @0)
- CA-2.6#11: 1 steps (Tab solve for x @0)
- CA-2.6#13: 1 steps (Tab solve for x @0)
- CA-2.6#17: 1 steps (Tab solve for m @0)
- CA-2.6#21: 1 steps (Tab solve for x @0)
- CA-2.6#25: 1 steps (Tab solve for x @0)
- CA-2.6#27: 1 steps (Tab solve for x @0)
- CA-2.6#37: 1 steps (Tab solve for x @0)
- CA-2.6#39: 1 steps (Tab solve for x @0)
- CA-2.6#41: 1 steps (Tab solve for x @0)
- CA-6.6#7: 1 steps (Tab solve for n @0)
- CA-6.6#11: 1 steps (Tab solve for x @0)
- CA-6.6#15: 1 steps (Tab solve for p @0)
- CA-6.6#31: 1 steps (Tab solve for n @0)
- CA-6.6#43: 1 steps (Tab solve for x @0)
- CA-6.6#45: 1 steps (Tab solve for x @0)
- CA-6.6#51: 1 steps (Tab solve for x @0)
- CA-6.6#61: 1 steps (Tab solve for x @0)
- C1-2.3#83: 1 steps (Tab plug in x = 0 @1)
- C1-2.3#85: 1 steps (Tab plug in x = −2 @1)
- C1-2.3#87: 1 steps (Tab plug in x = 7 @1)
- C1-2.3#89: 1 steps (Tab plug in x = 0 @1)
- C1-2.3#91: 1 steps (Tab plug in x = 1 @1)
- C1-3.3#107: 1 steps (Tab sum rule @1)
- C1-3.3#109: 1 steps (Tab sum rule @1)
- C1-3.3#115: 1 steps (Tab quotient rule @1)
- C1-3.3#117: 1 steps (Tab quotient rule @1)
- C1-3.5#175: 2 steps (Tab sum rule @1 → Tab quotient rule @1.1)
- C1-3.5#177: 2 steps (s @1 → Tab quotient rule @1)
- C1-3.5#179: 3 steps (s @1 → Shift+ArrowUp @1.0.1.1 → Tab quotient rule @1)
- C1-3.5#181: 1 steps (Tab product rule @1)
- C1-3.6#229: 1 steps (Tab chain rule (power) @1)
- C1-3.6#231: 1 steps (Tab chain rule (power) @1)
- C1-3.6#233: 1 steps (Tab chain rule (power) @1)
- C1-3.6#235: 2 steps (Tab chain rule (sin) @1 → Tab chain rule (cos) @1.1)
- C1-3.7#279: 1 steps (Tab chain rule (sin⁻¹) @1)
- C1-3.7#283: 1 steps (Tab chain rule (power) @1)
- C1-3.7#285: 1 steps (Tab quotient rule @1)
- C1-3.9#331: 1 steps (Tab product rule @1)
- C1-3.9#333: 2 steps (Tab chain rule (eᵘ) @1 → Tab product rule @1.1)
- C1-3.5#183: 4 steps (Tab one fraction @1.0.0 → s @1 → Tab expanded @1 → Tab quotient rule @1)
- C1-3.9#337: 2 steps (Tab sum rule @1 → Tab exponential rule @1.0)
- C1-3.9#339: 2 steps (Tab product rule @1 → Tab exponential rule @1.1.1)
- C1-3.9#341: 3 steps (Tab log rules @1.0 → Tab constant multiple @1 → Tab chain rule (ln) @1.0)
- C1-3.9#343: 2 steps (Tab chain rule (log) @1 → Tab quotient rule @1.1)
- C1-4.8#367: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = 3 @1)
- C1-4.8#371: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = π @1)
- C1-4.8#377: 3 steps (Tab L'Hôpital (0/0) @1 → Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- C1-4.8#379: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = 1 @1)
- C1-4.8#387: 4 steps (C 0·∞ as a fraction @1 → Tab L'Hôpital (∞/∞) @1 → Tab L'Hôpital (∞/∞) @1 → Tab x → ∞ @1)
- C1-4.8#391: 1 steps (Tab x → ∞: it grows without bound @1)
- C1-4.10#491: 1 steps (Tab ∫ sin = −cos, + C @1)
- C1-4.10#493: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- C1-4.10#497: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- C1-5.3#171: 2 steps (Tab sum rule @1 → Tab plug in the bounds @1)
- C1-5.3#175: 2 steps (Tab power rule @1 → Tab plug in the bounds @1)
- C1-5.3#177: 2 steps (Tab sum rule @1 → Tab plug in the bounds @1)
- C1-5.3#179: 2 steps (Tab power rule @1 → Tab plug in the bounds @1)
- C1-5.3#181: 2 steps (Tab power rule @1 → Tab plug in the bounds @1)
- C1-4.8#389: 3 steps (Tab one fraction @1.1.1 → Tab split into terms @1.1 → Tab plug in x = 0 @1)
- C1-5.3#183: 2 steps (Tab ∫ sin = −cos @1 → Tab plug in the bounds @1)
- C1-5.3#187: 3 steps (s @1 → Tab ∫ csc² = −cot @1 → Tab plug in the bounds @1)
- C1-5.3#189: 2 steps (Tab sum rule @1 → Tab plug in the bounds @1)
- C1-5.5#273: 1 steps (Tab power rule, + C @1)
- C1-5.6#321: 1 steps (Tab ∫ eˣ = eˣ, + C @1)
- C1-5.6#323: 1 steps (Tab ∫ aˣ = aˣ/ln a, + C @1)
- C1-5.6#325: 1 steps (Tab ∫ 1/x = ln|x|, + C @1)
- C1-5.6#327: 1 steps (Tab power rule, + C @1)
- C2-3.1#13: 2 steps (Tab by parts: u = x @1 → Tab ∫ eˣ = eˣ, + C @1.1.0)
- C2-3.1#27: 2 steps (Tab by parts: u = ln(x) @1 → Tab constant multiple, + C @1.1.0)
- C2-3.1#47: 2 steps (Tab by parts: u = ln(sin(x)) @1 → Tab ∫ cos = sin, + C @1.1.0)
- C2-3.2#79: 2 steps (Tab trig: power reduction @1.0 → Tab constant multiple, + C @1)
- C2-3.2#97: 2 steps (Tab half-angle: sin² = (1 − cos 2θ)/2 @1 → Tab plug in the bounds @1)
- C2-3.2#99: 1 steps (Tab half-angle: cos² = (1 + cos 2θ)/2, + C @1)
- C2-3.3#161: 2 steps (Tab partial fractions @1 → Tab power rule, + C @1)
- C2-3.3#163: 1 steps (Tab ∫ 1/√(25 − (x − 5)²) = sin⁻¹, the square completed, + C @1)
- C2-3.4#201: 2 steps (Tab partial fractions @1 → Tab sum rule, + C @1)
- C2-3.7#349: 2 steps (Tab ∫ 1/√(4 − x²) = sin⁻¹ @1 → Tab plug in the bounds @1)
- C2-3.7#379: 2 steps (Tab ∫ 1/√(1 − x²) = sin⁻¹ @1 → Tab plug in the bounds @1)
- C2-3.7#387: 2 steps (Tab ∫ 1/√(9 − x²) = sin⁻¹ @1 → Tab plug in the bounds @1)
- s1: 1 steps (Tab solve for x @0)
- s3: 2 steps (Tab L'Hôpital (0/0) @1 → Tab plug in x = 0 @1)
- s4: 1 steps (Tab product rule @1)
- s5: 2 steps (Tab by parts: u = x @1 → Tab ∫ eˣ = eˣ, + C @1.1.0)
- s6: 2 steps (Tab power rule @1 → Tab plug in the bounds @1)
