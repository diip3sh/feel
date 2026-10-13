# Vocabulary

Every word is a point in (mass, natural frequency, damping ratio). Overshoot and settle time are measured on a step from rest, settle meaning the last moment the motion is outside a ±2% band. These are the spring on its own. A component with walls can settle sooner: the heavy toggle's wall at its target stops the 3.2% overshoot, so a tap there settles in about 390 ms, not 686 ms. The rig's Measures and its readout both show the component's number, walls included.

| word | mass | frequency | ζ | overshoot | settles | physical |
|---|---|---|---|---|---|---|
| snappy | 1 | 3.4 Hz | 0.82 | 1.1% | 183 ms | k 456.4 · c 35.04 |
| crisp | 1 | 3.8 Hz | 0.92 | 0.1% | 206 ms | k 570.1 · c 43.93 |
| quick | 1 | 3.6 Hz | 0.95 | 0% | 233 ms | k 511.6 · c 42.98 |
| instant | 1 | 6 Hz | 1 | 0% | 155 ms | k 1421.2 · c 75.4 |
| precise | 1 | 4.5 Hz | 1 | 0% | 206 ms | k 799.4 · c 56.55 |
| stiff | 1 | 4.6 Hz | 0.9 | 0.2% | 163 ms | k 835.4 · c 52.02 |
| firm | 1 | 3.8 Hz | 0.95 | 0% | 220 ms | k 570.1 · c 45.36 |
| tight | 1 | 4.2 Hz | 0.85 | 0.6% | 159 ms | k 696.4 · c 44.86 |
| smooth | 1 | 1.8 Hz | 1 | 0% | 516 ms | k 127.9 · c 22.62 |
| soft | 1 | 1.4 Hz | 1 | 0% | 663 ms | k 77.4 · c 17.59 |
| gentle | 1 | 1.2 Hz | 1 | 0% | 774 ms | k 56.8 · c 15.08 |
| calm | 1 | 1.1 Hz | 1.1 | 0% | 1001 ms | k 47.8 · c 15.21 |
| lazy | 1 | 0.9 Hz | 1.2 | 0% | 1401 ms | k 32 · c 13.57 |
| bouncy | 1 | 2.4 Hz | 0.38 | 27.5% | 695 ms | k 227.4 · c 11.46 |
| playful | 1 | 2.6 Hz | 0.45 | 20.5% | 511 ms | k 266.9 · c 14.7 |
| springy | 1 | 2.8 Hz | 0.32 | 34.6% | 635 ms | k 309.5 · c 11.26 |
| wobbly | 1 | 1.8 Hz | 0.22 | 49.2% | 1500 ms | k 127.9 · c 4.98 |
| loose | 1 | 1.6 Hz | 0.3 | 37.2% | 1116 ms | k 101.1 · c 6.03 |
| elastic | 1 | 2.2 Hz | 0.28 | 40% | 999 ms | k 191.1 · c 7.74 |
| heavy | 3 | 1.35 Hz | 0.74 | 3.2% | 686 ms | k 215.8 · c 37.66 |
| weighty | 2.6 | 1.5 Hz | 0.78 | 2% | 382 ms | k 230.9 · c 38.23 |
| solid | 2 | 2.2 Hz | 0.88 | 0.3% | 325 ms | k 382.2 · c 48.66 |
| massive | 4.5 | 1.1 Hz | 0.8 | 1.5% | 543 ms | k 215 · c 49.76 |
| light | 0.45 | 3 Hz | 0.62 | 8.4% | 317 ms | k 159.9 · c 10.52 |
| airy | 0.35 | 2.2 Hz | 0.55 | 12.6% | 422 ms | k 66.9 · c 5.32 |
| feathery | 0.25 | 1.8 Hz | 0.6 | 9.5% | 525 ms | k 32 · c 3.39 |
| magnetic | – | – | – | – | – | adds magnets (strength 1) |
| sticky | – | – | – | – | – | adds friction (1) |
| resistant | – | – | – | – | – | adds friction (0.7), ζ 1 |
| clicky | 1 | 3.4 Hz | 0.8 | 1.5% | 176 ms | k 456.4 · c 34.18 · magnets 0.6 |
| tactile | – | – | – | – | – | adds magnets (strength 0.5) |

## How words blend

- **Frequency:** the geometric mean of the words that set one ("heavy snappy" sits between 1.35 Hz and 3.4 Hz on a log scale, at 2.14 Hz).
- **Damping ratio:** the plain mean.
- **Mass:** the product, so "heavy" twice is heavier still, capped at 8.
- **Magnets and friction:** the strongest word wins.
- **Amplifiers** (`very`, `really`, `super`, `extra` push further; `slightly`, `a bit`, `somewhat` pull back toward neutral) scale the next word's distance from neutral (mass 1, 2.2 Hz, ζ 0.8). Frequency and mass scale on a log scale.
- **Unknown words** are reported back, not guessed. If the user's word isn't here, pick the nearest ones, say which, and consider adding it with a line of reasoning.

## Reading the numbers

- **Frequency** is how quickly it wants to get there. Under 1.5 Hz reads as weight or calm, 2–3 Hz as normal UI, and over 4 Hz as instant or mechanical.
- **ζ** is how it arrives:
  - under 0.4 visibly bounces;
  - 0.6–0.85 lands with a small thump;
  - 1 arrives without overshoot;
  - over 1 creeps in.
- **Mass** only shows when something else pushes: a finger, a magnet, a wall. Same frequency and ζ with more mass means more lag behind the finger and a longer coast after a flick.
