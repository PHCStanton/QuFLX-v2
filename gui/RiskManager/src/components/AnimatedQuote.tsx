import { useState, useEffect } from 'react';

const quotes = [
  // Trading Psychology & Discipline
  "The goal of a successful trader is to make the best trades. Money is secondary. - Alexander Elder",
  "The key to trading success is emotional discipline. If intelligence were the key, there would be a lot more people making money trading. - Victor Sperandeo",
  "Your biggest enemy as a trader is yourself. Self-discipline and awareness are critical to overcoming these internal challenges. - Alexander Elder",
  "Trading doesn't just reveal your character, it also builds it if you stay in the game long enough.",

  // Risk Management & Capital Protection
  "Cut your losses short and let your winners run. - Jesse Livermore",
  "In trading, the best offense is a good defense. Protecting your capital should always be your first priority. - Paul Tudor Jones",
  "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong. - George Soros",
  "Risk comes from not knowing what you're doing. - Warren Buffett",
  "The most important rule of trading is to play great defense, not great offense. - Paul Tudor Jones",

  // Patience & Timing
  "The market is a device for transferring money from the impatient to the patient. - Warren Buffett",
  "I just wait until there is money lying in the corner, and all I have to do is go over there and pick it up. I do nothing in the meantime. - Jim Rogers",
  "The stock market is filled with individuals who know the price of everything, but the value of nothing. - Philip Fisher",

  // Learning & Growth
  "An investment in knowledge pays the best interest. - Benjamin Franklin",
  "It's not how much money you make, but how much money you keep. - Robert Kiyosaki",
  "In investing, what is comfortable is rarely profitable. - Robert Arnott",

  // Strategy & Execution
  "Know what you own, and know why you own it. - Peter Lynch",
  "The individual investor should act consistently as an investor and not as a speculator. - Ben Graham",
  "Losses are necessary, as long as they are associated with a technique to help you learn from them. - David Sikhosana",

  // Success Principles
  "The elements of good trading are: cutting losses, cutting losses, and cutting losses. If you can follow these three rules, you may have a chance. - Ed Seykota",
  "Every trader has strengths and weaknesses. Some are good holders of winners, but may hold their losers a little too long. Others may cut their winners a little short, but are quick to take their losses. As long as you stick to your own style, you get the good and bad in your own approach. - Michael Marcus",
  "The desire for constant action irrespective of underlying conditions is responsible for many losses on Wall Street. - Jesse Livermore",
  "Time is your friend; impulse is your enemy. - John Bogle",
  "The big money is not in the buying and selling, but in the waiting. - Charlie Munger"
];

const gradients = [
  'from-emerald-500/10 to-blue-500/10',
  'from-blue-500/10 to-cyan-500/10',
  'from-cyan-500/10 to-emerald-500/10',
  'from-emerald-500/10 to-teal-500/10',
  'from-teal-500/10 to-blue-500/10',
  'from-blue-500/10 to-emerald-500/10',
  'from-emerald-500/10 to-cyan-500/10',
  'from-cyan-500/10 to-teal-500/10',
  'from-teal-500/10 to-emerald-500/10',
  'from-blue-500/10 to-teal-500/10',
  'from-emerald-500/10 to-blue-500/10',
  'from-cyan-500/10 to-blue-500/10',
  'from-emerald-500/10 to-cyan-500/10',
  'from-blue-500/10 to-emerald-500/10',
  'from-teal-500/10 to-cyan-500/10',
  'from-cyan-500/10 to-emerald-500/10',
  'from-emerald-500/10 to-teal-500/10',
  'from-blue-500/10 to-cyan-500/10',
  'from-teal-500/10 to-blue-500/10',
  'from-emerald-500/10 to-blue-500/10',
  'from-cyan-500/10 to-teal-500/10',
  'from-blue-500/10 to-emerald-500/10',
  'from-teal-500/10 to-emerald-500/10'
];

export default function AnimatedQuote() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setCurrentIndex(Math.floor(Math.random() * quotes.length));
  }, []);

  useEffect(() => {
    if (isPaused) return;

    const intervalId = setInterval(() => {
      setIsTransitioning(true);

      setTimeout(() => {
        setCurrentIndex((prevIndex) => {
          let newIndex;
          do {
            newIndex = Math.floor(Math.random() * quotes.length);
          } while (newIndex === prevIndex);
          return newIndex;
        });

        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, 3000);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [isPaused]);

  return (
    <div
      className={`border-b border-gray-800 bg-gradient-to-r ${gradients[currentIndex]} transition-all duration-[3000ms] ease-in-out`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <p
          className={`text-emerald-400 text-center italic transition-all duration-[3000ms] ease-in-out ${
            isTransitioning ? 'opacity-0 blur-md scale-95' : 'opacity-100 blur-0 scale-100'
          }`}
        >
          "{quotes[currentIndex]}"
        </p>
      </div>
    </div>
  );
}
