# AI SVG Icons Variations

This document contains different AI-themed SVG icon options for use in the QuFLX Dashboard sidebar and other UI components.

---

## Option 1: AI Scanner Robot (Currently in use)

Streamline icon representing AI scanning/analysis functionality.

**Usage in Sidebar:**
```jsx
const AiInsightsChipBotIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M4.52212 0.683071c-0.03699 -0.34319 -0.34519 -0.5914115 -0.68838 -0.554419 -0.36033 0.03884 -0.71756 0.080286 -1.06861 0.121014l-0.12446 0.014435C1.39347 0.408653 0.399389 1.40083 0.259108 2.65118l-0.003293 0.02934c-0.042663 0.38024 -0.086119 0.76756 -0.126488 1.1588 -0.0354292 0.34336 0.214194 0.65042 0.557549 0.68585 0.343354 0.03543 0.650414 -0.21419 0.685844 -0.55755 0.03979 -0.38563 0.0827 -0.76811 0.12554 -1.1499l0.00305 -0.02717c0.07511 -0.66944 0.6115 -1.2069 1.28328 -1.28476l0.12443 -0.01443c0.3517 -0.04081 0.70373 -0.08165 1.05868 -0.11991 0.34319 -0.03699 0.59141 -0.34519 0.55442 -0.688379Zm4.95642 0c0.03699 -0.34319 0.34519 -0.5914115 0.68836 -0.554419 0.3603 0.03884 0.7175 0.080286 1.0686 0.121014l0.1245 0.014435c1.2472 0.144552 2.2412 1.136729 2.3815 2.387079l0.0033 0.02934c0.0426 0.38012 0.0861 0.76769 0.1265 1.1588 0.0354 0.34336 -0.2142 0.65042 -0.5575 0.68585 -0.3434 0.03543 -0.6505 -0.21419 -0.6859 -0.55755 -0.0398 -0.38553 -0.0827 -0.7679 -0.1255 -1.14959l-0.0031 -0.02748c-0.0751 -0.66944 -0.6115 -1.2069 -1.2833 -1.28476l-0.1244 -0.01443c-0.3517 -0.04081 -0.7037 -0.08165 -1.0587 -0.11991 -0.34313 -0.03699 -0.59136 -0.34519 -0.55436 -0.688379Zm-2.47966 0.881439c-0.37695 0 -0.7244 0.10717 -0.97724 0.36002 -0.25285 0.25285 -0.36003 0.60029 -0.36003 0.97724s0.10718 0.7244 0.36003 0.97724c0.10339 0.10339 0.2226 0.18243 0.35318 0.23974l-0.00002 0.66912c-0.59197 0.00483 -1.19608 0.02356 -1.75177 0.09614 -0.78519 0.10255 -1.42295 0.70724 -1.53867 1.50156 -0.06256 0.42945 -0.06256 0.86343 -0.06255 1.53566v0.05317c-0.00001 0.67222 -0.00001 1.1062 0.06255 1.53566 0.11572 0.79434 0.75348 1.39904 1.53867 1.50154 0.74905 0.0978 1.58608 0.0978 2.36278 0.0978h0.02821c0.7767 0 1.61373 0 2.36279 -0.0978 0.78519 -0.1025 1.42289 -0.7072 1.53859 -1.50154 0.0626 -0.42946 0.0626 -0.86344 0.0626 -1.53567v-0.05316c0 -0.67223 0 -1.10621 -0.0626 -1.53566 -0.1157 -0.79432 -0.7534 -1.39901 -1.53859 -1.50156 -0.55577 -0.07259 -1.15996 -0.09132 -1.75201 -0.09615l0.00002 -0.66994c0.12984 -0.05724 0.2484 -0.13601 0.3513 -0.23891 0.25284 -0.25284 0.36002 -0.60029 0.36002 -0.97724s-0.10718 -0.72439 -0.36002 -0.97724c-0.25285 -0.25285 -0.60029 -0.36002 -0.97724 -0.36002Zm1.29988 5.56503c-0.34518 0 -0.625 0.27982 -0.625 0.625v0.38748c0 0.34518 0.27983 0.625 0.625 0.625 0.34518 0 0.625 -0.27982 0.625 -0.625v-0.38748c0 -0.34518 -0.27982 -0.625 -0.625 -0.625Zm-3.22265 0.625c-0.00001 -0.34518 0.27982 -0.625 0.62499 -0.625 0.34518 0 0.625 0.27982 0.62501 0.625v0.38748c0 0.34518 -0.27982 0.625 -0.625 0.625s-0.625 -0.27982 -0.625 -0.625v-0.38748Zm5.09079 6.11696c-0.34317 0.0369 -0.65137 -0.2113 -0.68836 -0.5545 -0.037 -0.3432 0.21123 -0.6514 0.55436 -0.6883 0.355 -0.0383 0.707 -0.0791 1.0587 -0.1199l0.1244 -0.0145c0.6718 -0.0778 1.2082 -0.6153 1.2833 -1.2847l0.0031 -0.0272c0.0428 -0.3817 0.0857 -0.7644 0.1255 -1.1499 0.0354 -0.34337 0.3425 -0.59299 0.6859 -0.55757 0.3433 0.03543 0.5929 0.3425 0.5575 0.68587 -0.0404 0.3912 -0.0838 0.7785 -0.1265 1.1587l-0.0033 0.0294c-0.1403 1.2504 -1.1343 2.2426 -2.3815 2.3871l-0.1245 0.0144c-0.3509 0.0407 -0.7085 0.0822 -1.0686 0.1211Zm-6.33316 0c0.34319 0.0369 0.65139 -0.2113 0.68838 -0.5545 0.03699 -0.3432 -0.21123 -0.6514 -0.55442 -0.6883 -0.35494 -0.0383 -0.70696 -0.0791 -1.05864 -0.1199l-0.12447 -0.0145c-0.67178 -0.0778 -1.20817 -0.6153 -1.28328 -1.2847l-0.00305 -0.0272c-0.04284 -0.3817 -0.08575 -0.7643 -0.12554 -1.1499 -0.03543 -0.34337 -0.34249 -0.59299 -0.685844 -0.55757 -0.343355 0.03543 -0.5929782 0.3425 -0.557549 0.68587 0.04037 0.3912 0.083823 0.7785 0.126486 1.1588l0.003295 0.0293c0.140281 1.2504 1.134362 2.2426 2.381562 2.3871l0.12446 0.0144c0.35097 0.0407 0.70837 0.0822 1.06861 0.1211Z"
      clipRule="evenodd"
      strokeWidth="1"
    ></path>
  </svg>
);
```

**Raw SVG:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14" id="Ai-Scanner-Robot--Streamline-Flex" height="14" width="14">
  <g id="ai-scanner-robot--scan-scanning-artificial-intelligence-ai">
    <path id="Union" fill="currentColor" fill-rule="evenodd" d="M4.52212 0.683071c-0.03699 -0.34319 -0.34519 -0.5914115 -0.68838 -0.554419 -0.36033 0.03884 -0.71756 0.080286 -1.06861 0.121014l-0.12446 0.014435C1.39347 0.408653 0.399389 1.40083 0.259108 2.65118l-0.003293 0.02934c-0.042663 0.38024 -0.086119 0.76756 -0.126488 1.1588 -0.0354292 0.34336 0.214194 0.65042 0.557549 0.68585 0.343354 0.03543 0.650414 -0.21419 0.685844 -0.55755 0.03979 -0.38563 0.0827 -0.76811 0.12554 -1.1499l0.00305 -0.02717c0.07511 -0.66944 0.6115 -1.2069 1.28328 -1.28476l0.12443 -0.01443c0.3517 -0.04081 0.70373 -0.08165 1.05868 -0.11991 0.34319 -0.03699 0.59141 -0.34519 0.55442 -0.688379Z" />
  </g>
</svg>
```

---

## Option 2: Deepfake Technology (Alternative)

Streamline icon representing AI/face technology with a more detailed head outline.

**Usage in Sidebar:**
```jsx
const AiInsightsIconV2 = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.7336 10.9952V9.30799c0.5699 0.02387 0.8554 -0.02887 1.1986 -0.26692 0.3068 -0.21281 0.4088 -0.61411 0.3083 -0.9737 -0.9828 -3.51296 -2.508 -7.06273 -6.90456 -7.06273V12.9952h3.39763c1.10453 0 2.00003 -0.8954 2.00003 -2Z"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.86719 6.50928v0.16177"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.92163 4.0686c0.55172 0 0.86206 -0.31034 0.86206 -0.86206s-0.31034 -0.86206 -0.86206 -0.86206 -0.86206 0.31034 -0.86206 0.86206 0.31034 0.86206 0.86206 0.86206Z"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M1.46167 8.09326c0.55172 0 0.86206 -0.31034 0.86206 -0.86206s-0.31034 -0.86206 -0.86206 -0.86206c-0.551719 0 -0.862061 0.31034 -0.862061 0.86206s0.310342 0.86206 0.862061 0.86206Z"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.15112 12.1174c0.55172 0 0.86206 -0.3103 0.86206 -0.862s-0.31034 -0.8621 -0.86206 -0.8621 -0.86206 0.3104 -0.86206 0.8621 0.31034 0.862 0.86206 0.862Z"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.78399 3.2063h2.55195"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.79599 5.38354h1.53995"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m4.6748 11.2554 0 -2.00131 -1.09536 0"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.01398 11.2554h3.32196"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.32398 7.23071h4.01196"
      strokeWidth="1"
    />
  </svg>
);
```

**Raw SVG:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14" id="Deepfake-Technology-1--Streamline-Flex" height="14" width="14">
  <g id="deepfake-technology-1--automated-face-head-fake-generated-artificial-intelligence-ai">
    <path id="Vector" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M11.7336 10.9952V9.30799c0.5699 0.02387 0.8554 -0.02887 1.1986 -0.26692 0.3068 -0.21281 0.4088 -0.61411 0.3083 -0.9737 -0.9828 -3.51296 -2.508 -7.06273 -6.90456 -7.06273V12.9952h3.39763c1.10453 0 2.00003 -0.8954 2.00003 -2Z" stroke-width="1"></path>
    <path id="Vector 1296" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M9.86719 6.50928v0.16177" stroke-width="1"></path>
    <path id="Vector_2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M2.92163 4.0686c0.55172 0 0.86206 -0.31034 0.86206 -0.86206s-0.31034 -0.86206 -0.86206 -0.86206 -0.86206 0.31034 -0.86206 0.86206 0.31034 0.86206 0.86206 0.86206Z" stroke-width="1"></path>
    <path id="Vector_3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.46167 8.09326c0.55172 0 0.86206 -0.31034 0.86206 -0.86206s-0.31034 -0.86206 -0.86206 -0.86206c-0.551719 0 -0.862061 0.31034 -0.862061 0.86206s0.310342 0.86206 0.862061 0.86206Z" stroke-width="1"></path>
    <path id="Vector_4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M2.15112 12.1174c0.55172 0 0.86206 -0.3103 0.86206 -0.862s-0.31034 -0.8621 -0.86206 -0.8621 -0.86206 0.3104 -0.86206 0.8621 0.31034 0.862 0.86206 0.862Z" stroke-width="1"></path>
    <path id="Ellipse 1554" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M3.78399 3.2063h2.55195" stroke-width="1"></path>
    <path id="Ellipse 1557" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M4.79599 5.38354h1.53995" stroke-width="1"></path>
    <path id="Ellipse 1558" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m4.6748 11.2554 0 -2.00131 -1.09536 0" stroke-width="1"></path>
    <path id="Ellipse 1556" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M3.01398 11.2554h3.32196" stroke-width="1"></path>
    <path id="Ellipse 1555" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M2.32398 7.23071h4.01196" stroke-width="1"></path>
  </g>
</svg>
```

---

## Comparison Notes

| Feature | Option 1 (Robot) | Option 2 (Face/Tech) |
|---------|------------------|---------------------|
| Style | Filled icon | Stroked/line icon |
| Complexity | Single path | Multiple paths |
| ViewBox | 14x14 | 14x14 |
| Representation | Robot/AI bot | Face/AI technology |
| Best for | General AI | Deepfake/face AI |
