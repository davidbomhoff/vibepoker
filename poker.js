document.addEventListener('DOMContentLoaded', () => {
    let gameState = {
        introStep: 0,
        deck: [],
        playerHand: [],
        communityCards: [],
        pot: 0,
        playerStack: 500,
        playerBet: 0,
        playerFolded: false,
        gamePhase: 'preFlop',
        smallBlind: 1,
        bigBlind: 2,
        gameOver: false,
        currentRound: 0,
        dealerPosition: 0,
        smallBlindPos: 1,
        bigBlindPos: 2,
        aiPlayers: [],
        activePlayers: [],
        currentBet: 0,
        roundWinner: null,
        roundOver: false,
        roundsWon: 0,
        highestHand: null,
        initialStack: 500,
        bettingRoundComplete: false,
        playerHasActedThisRound: false
    };

    const INTRO_SCRIPT = [
        "Welcome to VibePoker - WPT Rules",
        "Each hand gets 2 hole cards (your cards)",
        "Pre-Flop: Everyone gets their 2 cards to see | Place bets or fold",
        "Flop: 3 shared cards revealed (see how you're doing)",
        "Turn: 1 more shared card",
        "River: Final shared card (make your best 5-card hand)",
        "Showdown: Best hand wins the pot!"
    ];

    class Card {
        constructor(value, suit) {
            this.value = value;
            this.suit = suit;
            this.rank = this.getValue();
        }

        getValue() {
            const ranks = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
            return ranks[this.value];
        }

        getImagePath() {
            return `cards/${this.value}-${this.suit}.svg`;
        }

        toString() {
            return `${this.value}${this.suit[0].toUpperCase()}`;
        }
    }

    class AIPlayer {
        constructor(id, name) {
            this.id = id;
            this.name = name;
            this.hand = [];
            this.stack = 500;
            this.bet = 0;
            this.totalBet = 0;
            this.hasFolded = false;
            this.isAllIn = false;
        }

        evaluateHand(communityCards = []) {
            if (this.hand.length < 2) return 0;

            // Pre-flop: evaluate only own hole cards (cannot see any community cards yet)
            if (communityCards.length === 0) {
                const ranks = this.hand.map(c => c.rank);
                const isPair = ranks[0] === ranks[1];
                const isSuited = this.hand[0].suit === this.hand[1].suit;
                const highCard = Math.max(...ranks);
                const gap = Math.abs(ranks[0] - ranks[1]);
                let strength = highCard / 14;
                if (isPair) strength = 0.65 + (ranks[0] / 14) * 0.2;
                else if (isSuited && gap <= 2) strength = Math.max(strength, 0.55);
                else if (highCard >= 13) strength = Math.max(strength, 0.50);
                return Math.min(1.0, strength + Math.random() * 0.1);
            }

            // Post-flop: evaluate best 5-card hand using only own cards + visible community cards
            const allCards = [...this.hand, ...communityCards];
            const { score } = HandEvaluator.findBestHand(allCards);

            // Normalize score from HandEvaluator.scoreHand() to a 0–1 strength value.
            // HandEvaluator scores: Royal Flush=1,000,000 … One Pair=200,000 …
            // High Card = highestRank * 100 (max Ace = 14 * 100 = 1,400).
            if (score >= 1000000) return 1.00; // Royal Flush
            if (score >= 900000)  return 0.95; // Straight Flush
            if (score >= 800000)  return 0.90; // Four of a Kind
            if (score >= 700000)  return 0.85; // Full House
            if (score >= 600000)  return 0.80; // Flush
            if (score >= 500000)  return 0.75; // Straight
            if (score >= 400000)  return 0.65; // Three of a Kind
            if (score >= 300000)  return 0.55; // Two Pair
            if (score >= 200000)  return 0.45; // One Pair
            // High Card: scale 0–1400 into 0.10–0.35 (below One Pair threshold of 0.45)
            return Math.max(0.10, (score / 1400) * 0.35);
        }

        makeDecision(currentBet, pot, communityCards) {
            if (this.hasFolded || this.stack === 0) return 'fold';

            // AI only evaluates its own cards plus the revealed community cards —
            // it has no knowledge of other players' hole cards or undealt cards.
            const handStrength = this.evaluateHand(communityCards);

            // Bluffing: ~20% chance to bet/raise with a weak hand
            const isBluffing = handStrength < 0.45 && Math.random() < 0.20;

            // Slow-playing: ~15% chance to just call instead of raising with a very strong hand
            const isSlowPlaying = handStrength > 0.75 && Math.random() < 0.15;

            if (currentBet === 0) {
                if (isBluffing) return 'bet';
                return handStrength > 0.6 ? 'bet' : 'check';
            }

            const amountToCall = Math.min(currentBet - this.bet, this.stack);
            const remainingStack = this.stack - amountToCall;

            if (isBluffing) {
                return remainingStack > 0 ? 'raise' : 'call';
            }

            if (handStrength > 0.75) {
                if (isSlowPlaying) return 'call';
                return remainingStack > 0 ? 'raise' : 'call';
            } else if (handStrength > 0.5) {
                return 'call';
            } else {
                return 'fold';
            }
        }

        reset() {
            this.hand = [];
            this.bet = 0;
            this.totalBet = 0;
            this.hasFolded = false;
            this.isAllIn = false;
        }
    }

    class HandEvaluator {
        static evaluate(cards) {
            if (cards.length < 5) return 'Incomplete';
            const best = this.findBestHand(cards);
            return this.classifyHand(best);
        }

        static findBestHand(cards) {
            const combos = this.getCombinations(cards, 5);
            let best = null;
            let bestScore = -1;
            combos.forEach(combo => {
                const score = this.scoreHand(combo);
                if (score > bestScore) {
                    bestScore = score;
                    best = combo;
                }
            });
            return { hand: best || cards.slice(0, 5), score: bestScore };
        }

        static getCombinations(arr, n) {
            if (n === 1) return arr.map(x => [x]);
            const combos = [];
            for (let i = 0; i <= arr.length - n; i++) {
                const tail = this.getCombinations(arr.slice(i + 1), n - 1);
                tail.forEach(t => combos.push([arr[i], ...t]));
            }
            return combos;
        }

        static scoreHand(hand) {
            const sorted = hand.sort((a, b) => b.rank - a.rank);
            if (this.isStraight(sorted) && this.isFlush(sorted) && sorted[0].rank === 14) return 1000000;
            if (this.isStraight(sorted) && this.isFlush(sorted)) return 900000;
            if (this.countOf(sorted, 4)) return 800000;
            if (this.isFullHouse(sorted)) return 700000;
            if (this.isFlush(sorted)) return 600000;
            if (this.isStraight(sorted)) return 500000;
            if (this.countOf(sorted, 3)) return 400000;
            if (this.isTwoPair(sorted)) return 300000;
            if (this.countOf(sorted, 2)) return 200000;
            return sorted[0].rank * 100;
        }

        static isFlush(hand) {
            return hand.every(c => c.suit === hand[0].suit);
        }

        static isStraight(hand) {
            const sorted = hand.map(c => c.rank).sort((a, b) => b - a);
            return sorted[0] - sorted[4] === 4 && new Set(sorted).size === 5;
        }

        static countOf(hand, n) {
            const counts = {};
            hand.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);
            return Object.values(counts).includes(n);
        }

        static isFullHouse(hand) {
            const counts = {};
            hand.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);
            const vals = Object.values(counts).sort((a, b) => b - a);
            return vals[0] === 3 && vals[1] === 2;
        }

        static isTwoPair(hand) {
            const counts = {};
            hand.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);
            const pairs = Object.values(counts).filter(c => c === 2);
            return pairs.length === 2;
        }

        static classifyHand(result) {
            const hand = result.hand;
            const sorted = hand.sort((a, b) => b.rank - a.rank);
            if (this.isStraight(sorted) && this.isFlush(sorted) && sorted[0].rank === 14) return 'Royal Flush';
            if (this.isStraight(sorted) && this.isFlush(sorted)) return 'Straight Flush';
            if (this.countOf(sorted, 4)) return 'Four of a Kind';
            if (this.isFullHouse(sorted)) return 'Full House';
            if (this.isFlush(sorted)) return 'Flush';
            if (this.isStraight(sorted)) return 'Straight';
            if (this.countOf(sorted, 3)) return 'Three of a Kind';
            if (this.isTwoPair(sorted)) return 'Two Pair';
            if (this.countOf(sorted, 2)) return 'Pair';
            return 'High Card';
        }
    }

    function createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
        const deck = [];
        for (let suit of suits) {
            for (let value of values) {
                deck.push(new Card(value, suit));
            }
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function displayCard(card, container, hidden = false) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';
        const img = document.createElement('img');
        if (!hidden && card) {
            img.src = card.getImagePath();
            img.alt = card.toString();
        } else {
            img.src = 'cards/hidden.svg';
            img.alt = 'Hidden';
            cardDiv.classList.add('hidden');
        }
        cardDiv.appendChild(img);
        container.appendChild(cardDiv);
    }

    function displayPlayerCards() {
        const container = document.getElementById('player-cards');
        if (container) {
            container.innerHTML = '';
            gameState.playerHand.forEach(card => displayCard(card, container, false));
        }
    }

    function displayCommunityCards(newlyDealtCount = 0) {
        const container = document.getElementById('community-cards');
        if (container) {
            container.innerHTML = '';
            const totalDealt = gameState.communityCards.length;
            for (let i = 0; i < 5; i++) {
                if (i < totalDealt) {
                    // Build the card div manually so we can add the flip animation
                    const cardDiv = document.createElement('div');
                    cardDiv.className = 'card';
                    const img = document.createElement('img');
                    img.src = gameState.communityCards[i].getImagePath();
                    img.alt = gameState.communityCards[i].toString();
                    cardDiv.appendChild(img);

                    // Animate only the cards that were just dealt
                    if (newlyDealtCount > 0 && i >= totalDealt - newlyDealtCount) {
                        // Stagger each new card slightly so they flip in sequence
                        const staggerDelay = (i - (totalDealt - newlyDealtCount)) * 0.12;
                        cardDiv.style.animationDelay = `${staggerDelay}s`;
                        cardDiv.classList.add('dealing');
                    }

                    container.appendChild(cardDiv);
                } else {
                    // Empty placeholder for cards not yet dealt
                    displayCard(null, container, true);
                }
            }
        }
    }

    function displayAICards(playerId, reveal = false) {
        const container = document.getElementById(`ai-player-${playerId}-cards`);
        if (!container) return;
        container.innerHTML = '';
        const player = gameState.aiPlayers[playerId];
        if (player.hand.length > 0) {
            displayCard(player.hand[0], container, !reveal);
            displayCard(player.hand[1], container, !reveal);
        }
    }

    function displayBetChips() {
        // Player bets - show as text
        const playerBetDisplay = document.getElementById('player-bet-display');
        if (playerBetDisplay) {
            playerBetDisplay.innerHTML = gameState.playerBet > 0 ? `$${gameState.playerBet} bet` : '';
        }

        // AI bets - show as text
        for (let id = 0; id < 3; id++) {
            const display = document.getElementById(`ai-player-${id}-bet-display`);
            if (display && gameState.aiPlayers[id]) {
                display.innerHTML = gameState.aiPlayers[id].bet > 0 ? `$${gameState.aiPlayers[id].bet} bet` : '';
            }
        }
    }

    function updatePotDisplay() {
        const potDisplay = document.getElementById('pot-display');
        if (potDisplay) potDisplay.textContent = '$' + gameState.pot;

        const potChips = document.getElementById('pot-chips');
        if (potChips) {
            potChips.innerHTML = '';
            const chipCount = Math.max(1, Math.ceil(gameState.pot / 10));
            for (let i = 0; i < Math.min(chipCount, 12); i++) {
                const chip = document.createElement('div');
                chip.className = 'chip';
                potChips.appendChild(chip);
            }
        }
    }

    function calculateHandProbabilities() {
        const handRanks = [
            'Royal Flush',
            'Straight Flush',
            'Four of a Kind',
            'Full House',
            'Flush',
            'Straight',
            'Three of a Kind',
            'Two Pair',
            'Pair',
            'High Card'
        ];
        
        const probabilities = {};
        handRanks.forEach(rank => probabilities[rank] = 0);

        // Handle incomplete board
        if (gameState.communityCards.length < 3) {
            return probabilities;
        }

        // Build available card deck
        const usedCards = new Set();
        gameState.playerHand.forEach(card => usedCards.add(card.toString()));
        gameState.communityCards.forEach(card => usedCards.add(card.toString()));
        gameState.aiPlayers.forEach(player => {
            player.hand.forEach(card => usedCards.add(card.toString()));
        });

        const remainingCards = [];
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
        for (let suit of suits) {
            for (let value of values) {
                const cardStr = value + suit.charAt(0).toUpperCase();
                if (!usedCards.has(cardStr)) {
                    remainingCards.push(new Card(value, suit));
                }
            }
        }

        // Monte Carlo simulation
        const simulations = 2000;
        for (let sim = 0; sim < simulations; sim++) {
            let board = [...gameState.playerHand, ...gameState.communityCards];
            let needed = 5 - gameState.communityCards.length;
            let deck = [...remainingCards].sort(() => Math.random() - 0.5);
            
            for (let i = 0; i < needed && deck.length > 0; i++) {
                board.push(deck.pop());
            }

            if (board.length >= 5) {
                const bestHand = HandEvaluator.findBestHand(board);
                const handRank = HandEvaluator.classifyHand(bestHand);
                probabilities[handRank]++;
            }
        }

        // Convert to percentages
        for (let rank in probabilities) {
            probabilities[rank] = Math.round((probabilities[rank] / simulations) * 100);
        }

        return probabilities;
    }

    function displayPossibleHands() {
        const handsContainer = document.getElementById('possible-hands');
        if (!handsContainer) return;
        
        const handRanks = [
            'Royal Flush',
            'Straight Flush',
            'Four of a Kind',
            'Full House',
            'Flush',
            'Straight',
            'Three of a Kind',
            'Two Pair',
            'Pair',
            'High Card'
        ];
        
        const probabilities = calculateHandProbabilities();
        
        handsContainer.innerHTML = '';
        handRanks.forEach(rank => {
            const prob = probabilities[rank] || 0;
            if (prob === 0) return;
            
            const item = document.createElement('div');
            item.className = 'hand-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'hand-name';
            nameSpan.textContent = rank;
            
            const probSpan = document.createElement('span');
            probSpan.className = 'hand-prob';
            probSpan.textContent = prob + '%';
            
            item.appendChild(nameSpan);
            item.appendChild(probSpan);
            handsContainer.appendChild(item);
        });
    }

    function updateCurrentHand() {
        const currentHandEl = document.getElementById('current-hand');
        if (!currentHandEl) return;
        
        if (gameState.communityCards.length < 3) {
            currentHandEl.textContent = '—';
            return;
        }
        
        const allCards = [...gameState.playerHand, ...gameState.communityCards];
        if (allCards.length < 5) {
            currentHandEl.textContent = '—';
            return;
        }
        
        const playerHand = HandEvaluator.findBestHand(allCards);
        const handRank = HandEvaluator.classifyHand(playerHand);
        currentHandEl.textContent = handRank;
    }

    function updateDisplay() {
        updatePotDisplay();
        displayBetChips();

        const stackEl = document.getElementById('player-stack');
        if (stackEl) stackEl.textContent = '$' + gameState.playerStack;

        for (let i = 0; i < 3; i++) {
            const stackDisplay = document.getElementById(`ai-player-${i}-stack`);
            if (stackDisplay && gameState.aiPlayers[i]) {
                // Show "OUT" for eliminated players; otherwise show their chip count
                if (gameState.aiPlayers[i].stack <= 0 && gameState.aiPlayers[i].hand.length === 0) {
                    stackDisplay.textContent = 'OUT';
                } else {
                    stackDisplay.textContent = '$' + gameState.aiPlayers[i].stack;
                }
            }
        }
    }

    function showIntroStep() {
        const msg = document.getElementById('game-message');
        if (msg && gameState.introStep < INTRO_SCRIPT.length) {
            // On the first step, greet returning players by showing their all-time score
            if (gameState.introStep === 0 && isReturningPlayer()) {
                const score = loadLifetimeScore();
                const label = score >= 0 ? 'WINNINGS' : 'DEBT';
                msg.textContent = `Welcome back! Your ${label}: $${Math.abs(score)}`;
            } else {
                msg.textContent = INTRO_SCRIPT[gameState.introStep];
            }
        }
        
        // Show game examples during intro
        showIntroExample();
    }

    function showIntroExample() {
        const step = gameState.introStep;
        
        // Only show examples for certain steps
        if (step === 1 || step === 2 || step === 3 || step === 4 || step === 5) {
            // Create temporary game state for demo
            if (!gameState.introDemo) {
                gameState.introDemo = {
                    deck: createDeck(),
                    playerHand: [],
                    communityCards: [],
                    aiPlayers: [
                        new AIPlayer(0, 'Player 1'),
                        new AIPlayer(1, 'Player 2'),
                        new AIPlayer(2, 'Player 3')
                    ]
                };
                
                // Deal cards
                gameState.introDemo.playerHand = [gameState.introDemo.deck.pop(), gameState.introDemo.deck.pop()];
                gameState.introDemo.aiPlayers.forEach(p => {
                    p.hand = [gameState.introDemo.deck.pop(), gameState.introDemo.deck.pop()];
                });
            }
            
            // Show appropriate game state based on step
            displayCard(gameState.introDemo.playerHand[0], document.getElementById('player-cards'), false);
            if (document.getElementById('player-cards')) {
                document.getElementById('player-cards').innerHTML = '';
                gameState.introDemo.playerHand.forEach(card => displayCard(card, document.getElementById('player-cards'), false));
            }
            
            gameState.introDemo.aiPlayers.forEach((p, i) => {
                const container = document.getElementById(`ai-player-${i}-cards`);
                if (container) {
                    container.innerHTML = '';
                    p.hand.forEach(card => displayCard(card, container, false));
                }
            });
            
            // Populate community cards based on step
            const communityContainer = document.getElementById('community-cards');
            if (communityContainer) {
                communityContainer.innerHTML = '';
                
                let cardsToShow = 0;
                if (step === 3) cardsToShow = 3; // Flop
                else if (step === 4) cardsToShow = 4; // Turn
                else if (step === 5) cardsToShow = 5; // River
                
                if (gameState.introDemo.communityCards.length < cardsToShow) {
                    while (gameState.introDemo.communityCards.length < cardsToShow) {
                        gameState.introDemo.communityCards.push(gameState.introDemo.deck.pop());
                    }
                }
                
                for (let i = 0; i < 5; i++) {
                    if (i < gameState.introDemo.communityCards.length) {
                        displayCard(gameState.introDemo.communityCards[i], communityContainer, false);
                    } else {
                        displayCard(null, communityContainer, true);
                    }
                }
            }
        } else {
            // Clear the demo on other steps
            if (gameState.introDemo) {
                const playerCards = document.getElementById('player-cards');
                const communityCards = document.getElementById('community-cards');
                if (playerCards) playerCards.innerHTML = '';
                if (communityCards) communityCards.innerHTML = '';
                gameState.introDemo.aiPlayers.forEach((_, i) => {
                    const container = document.getElementById(`ai-player-${i}-cards`);
                    if (container) container.innerHTML = '';
                });
            }
        }
    }

    const nextIntroBtn = document.getElementById('next-intro');
    if (nextIntroBtn) {
        nextIntroBtn.addEventListener('click', () => {
            gameState.introStep++;
            if (gameState.introStep < INTRO_SCRIPT.length) {
                showIntroStep();
            } else {
                const nextBtn = document.getElementById('next-intro');
                if (nextBtn) nextBtn.style.display = 'none';
                const startBtn = document.getElementById('start-game');
                if (startBtn) startBtn.style.display = 'inline-block';
                const msg = document.getElementById('game-message');
                if (msg) msg.textContent = 'Ready? Click Deal Now!';
                
                // Clear intro demo
                const playerCards = document.getElementById('player-cards');
                const communityCards = document.getElementById('community-cards');
                if (playerCards) playerCards.innerHTML = '';
                if (communityCards) communityCards.innerHTML = '';
                if (gameState.introDemo) {
                    gameState.introDemo.aiPlayers.forEach((_, i) => {
                        const container = document.getElementById(`ai-player-${i}-cards`);
                        if (container) container.innerHTML = '';
                    });
                }
            }
        });
    }

    const startGameBtn = document.getElementById('start-game');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            const introCtrl = document.getElementById('intro-controls');
            if (introCtrl) introCtrl.style.display = 'none';
            initializeGame();
        });
    }

    function initializeGame() {
        gameState.aiPlayers = [
            new AIPlayer(0, 'Player 1'),
            new AIPlayer(1, 'Player 2'),
            new AIPlayer(2, 'Player 3')
        ];
        startNewHand();
    }

    function startNewHand() {
        gameState.deck = createDeck();
        gameState.playerHand = [gameState.deck.pop(), gameState.deck.pop()];
        gameState.communityCards = [];
        gameState.pot = 0;
        gameState.playerBet = 0;
        gameState.playerFolded = false;
        gameState.gamePhase = 'preFlop';
        gameState.currentRound++;
        gameState.gameOver = false;
        gameState.roundOver = false;
        gameState.roundWinner = null;
        gameState.currentBet = gameState.bigBlind;

        // Remove folded state from all player seats
        document.querySelectorAll('.player-seat.folded').forEach(seat => {
            seat.classList.remove('folded');
        });

        gameState.aiPlayers.forEach((player, i) => {
            player.reset();
            if (player.stack > 0) {
                // Active player – deal two hole cards as normal
                player.hand = [gameState.deck.pop(), gameState.deck.pop()];
            }
            // player.hand stays [] when stack = 0 (eliminated); reset() already cleared it.

            // Update the visual "eliminated" state for each AI seat
            const aiCardContainer = document.getElementById(`ai-player-${i}-cards`);
            const aiSeat = aiCardContainer ? aiCardContainer.closest('.player-seat') : null;
            const stackEl = document.getElementById(`ai-player-${i}-stack`);
            if (aiSeat) {
                if (player.stack <= 0) {
                    aiSeat.classList.add('eliminated');
                    // Show an "OUT" badge inside the seat if not already present
                    if (!aiSeat.querySelector('.eliminated-label')) {
                        const label = document.createElement('div');
                        label.className = 'eliminated-label';
                        label.textContent = 'OUT';
                        aiSeat.appendChild(label);
                    }
                    if (stackEl) stackEl.textContent = 'OUT';
                } else {
                    aiSeat.classList.remove('eliminated');
                    // Remove any leftover OUT badge from a previous session
                    const oldLabel = aiSeat.querySelector('.eliminated-label');
                    if (oldLabel) oldLabel.remove();
                }
            }
        });

        // Only include players with chips in active players
        gameState.activePlayers = [0, 1, 2].filter(i => {
            if (i < gameState.aiPlayers.length) {
                return gameState.aiPlayers[i].stack > 0;
            }
            return true; // Player (index 'player') is always active
        });

        // Post blinds only if player has chips
        if (gameState.aiPlayers[gameState.smallBlindPos] && gameState.aiPlayers[gameState.smallBlindPos].stack > 0) {
            gameState.aiPlayers[gameState.smallBlindPos].bet = gameState.smallBlind;
            gameState.aiPlayers[gameState.smallBlindPos].stack -= gameState.smallBlind;
            gameState.aiPlayers[gameState.smallBlindPos].totalBet = gameState.smallBlind;
            gameState.pot += gameState.smallBlind;
        }
        if (gameState.aiPlayers[gameState.bigBlindPos] && gameState.aiPlayers[gameState.bigBlindPos].stack > 0) {
            gameState.aiPlayers[gameState.bigBlindPos].bet = gameState.bigBlind;
            gameState.aiPlayers[gameState.bigBlindPos].stack -= gameState.bigBlind;
            gameState.aiPlayers[gameState.bigBlindPos].totalBet = gameState.bigBlind;
            gameState.pot += gameState.bigBlind;
        }

        displayPlayerCards();
        displayCommunityCards();
        gameState.aiPlayers.forEach((p, i) => displayAICards(i, false));
        displayPossibleHands();
        updateCurrentHand();
        updateDisplay();

        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'flex';
        const msg = document.getElementById('game-message');
        if (msg) msg.textContent = 'Pre-Flop. Big blind to your left. Call $' + gameState.bigBlind + ' or Fold.';
        updateButtonStates();
    }

    function updateButtonStates() {
        const canAct = gameState.playerStack > 0 && !gameState.gameOver && !gameState.playerFolded;
        
        // Get all action buttons
        const foldBtn = document.getElementById('fold');
        const checkBtn = document.getElementById('check');
        const callBtn = document.getElementById('call');
        const betBtn = document.getElementById('bet');
        const raiseBtn = document.getElementById('raise');
        const allInBtn = document.getElementById('all-in');
        
        // Disable all buttons if cannot act
        if (!canAct) {
            [foldBtn, checkBtn, callBtn, betBtn, raiseBtn, allInBtn].forEach(b => {
                if (b) b.disabled = true;
            });
            return;
        }
        
        const amountToCall = Math.min(Math.max(0, gameState.currentBet - gameState.playerBet), gameState.playerStack);
        
        // Player can always fold and go all-in
        if (foldBtn) foldBtn.disabled = false;
        if (allInBtn) allInBtn.disabled = gameState.playerStack === 0;
        
        // Check only if no bet to call
        if (amountToCall === 0) {
            if (checkBtn) checkBtn.disabled = false;
            if (callBtn) callBtn.disabled = true;
            if (betBtn) betBtn.disabled = false;
            if (raiseBtn) raiseBtn.disabled = true;
        } else {
            // Must call, bet, or raise
            if (checkBtn) checkBtn.disabled = true;
            if (callBtn) callBtn.disabled = false;
            if (betBtn) betBtn.disabled = true;
            if (raiseBtn) raiseBtn.disabled = gameState.playerStack <= amountToCall;
        }
    }

    document.getElementById('fold').addEventListener('click', () => {
        gameState.playerFolded = true;
        const msg = document.getElementById('game-message');
        if (msg) msg.textContent = 'You folded';
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'none';
        
        // Reveal player cards and dim panel
        displayPlayerCards(); // Show actual cards instead of hidden
        const playerCenter = document.querySelector('.player-seat.player-center');
        if (playerCenter) playerCenter.classList.add('folded');
        
        updateButtonStates();
        setTimeout(() => advancePhase(), 800);
    });

    document.getElementById('check').addEventListener('click', () => {
        const msg = document.getElementById('game-message');
        if (msg) msg.textContent = '✓ You checked';
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'none';
        updateButtonStates();
        setTimeout(() => advancePhase(), 800);
    });

    document.getElementById('call').addEventListener('click', () => {
        const amountToCall = Math.min(gameState.currentBet - gameState.playerBet, gameState.playerStack);
        if (amountToCall > 0) {
            gameState.playerStack -= amountToCall;
            gameState.playerBet += amountToCall;
            gameState.pot += amountToCall;
        }
        const msg = document.getElementById('game-message');
        if (msg) msg.textContent = amountToCall > 0 ? `Called $${amountToCall}` : 'You checked';
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'none';
        updateDisplay();
        setTimeout(() => advancePhase(), 800);
    });

    document.getElementById('bet').addEventListener('click', () => {
        const section = document.getElementById('bet-input-section');
        if (section) section.style.display = 'flex';
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'none';
    });

    document.getElementById('raise').addEventListener('click', () => {
        const section = document.getElementById('bet-input-section');
        if (section) section.style.display = 'flex';
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'none';
    });

    document.getElementById('all-in').addEventListener('click', () => {
        gameState.pot += gameState.playerStack;
        gameState.playerBet += gameState.playerStack;
        gameState.playerStack = 0;
        const msg = document.getElementById('game-message');
        if (msg) msg.textContent = 'ALL IN';
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'none';
        updateButtonStates();
        updateDisplay();
        setTimeout(() => advancePhase(), 800);
    });

    document.getElementById('confirm-bet').addEventListener('click', () => {
        const amountEl = document.getElementById('bet-amount');
        if (!amountEl) return;
        const bet = parseInt(amountEl.value);
        if (isNaN(bet) || bet <= 0 || bet > gameState.playerStack) {
            alert('Invalid amount');
            return;
        }
        gameState.playerStack -= bet;
        gameState.playerBet += bet;
        gameState.pot += bet;
        gameState.currentBet = Math.max(gameState.currentBet, gameState.playerBet);
        const msg = document.getElementById('game-message');
        if (msg) msg.textContent = `Bet $${bet}`;
        amountEl.value = '';
        const section = document.getElementById('bet-input-section');
        if (section) section.style.display = 'none';
        updateButtonStates();
        updateDisplay();
        setTimeout(() => advancePhase(), 800);
    });

    document.getElementById('cancel-bet').addEventListener('click', () => {
        const section = document.getElementById('bet-input-section');
        if (section) section.style.display = 'none';
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'flex';
    });

    const CARD_REVEAL_DELAY_MS = 1000;

    function countActivePlayers() {
        // Only count AIs who were dealt cards this hand (hand.length > 0) AND haven't folded.
        // AIs eliminated before the hand (stack = 0) are never dealt cards, so hand.length = 0.
        const activeAIs = gameState.aiPlayers.filter(p => !p.hasFolded && p.hand.length > 0).length;
        return activeAIs + (gameState.playerFolded ? 0 : 1);
    }

    async function advancePhase() {
        if (gameState.roundOver || gameState.gameOver) return;
        
        // Check if any players can still bet (have chips left)
        const canPlayerBet = !gameState.playerFolded && gameState.playerStack > 0;
        const canAnyAIBet = gameState.aiPlayers.some(p => !p.hasFolded && p.stack > 0);
        
        // If no one can bet, auto-reveal remaining community cards and go to showdown
        if (!canPlayerBet && !canAnyAIBet) {
            // Auto-reveal all remaining community cards
            while (gameState.communityCards.length < 5 && gameState.deck.length > 0) {
                gameState.communityCards.push(gameState.deck.pop());
            }
            displayCommunityCards();
            updateCurrentHand();
            displayPossibleHands();
            const msg = document.getElementById('game-message');
            if (msg) msg.textContent = 'All players all-in! Revealing remaining cards...';
            await new Promise(r => setTimeout(r, 1500));
            showdown();
            return;
        }
        
        // Count total active (non-folded) players
        const totalActive = countActivePlayers();
        
        // If only 1 or fewer players remain, go to showdown immediately
        if (totalActive <= 1) {
            showdown();
            return;
        }
        
        // Betting sequence: User -> P1 -> P2 -> P3 -> repeat until bets are settled
        // The player section skips when folded, so this loop handles both cases.
        const playerOrder = ['player', 'ai0', 'ai1', 'ai2'];
        let bettingContinues = true;
        let roundCount = 0;
        const maxRounds = 20; // Prevent infinite loops
        
        while (bettingContinues && roundCount < maxRounds && !gameState.gameOver) {
            roundCount++;
            bettingContinues = false;
            
            for (let i = 0; i < playerOrder.length; i++) {
                if (gameState.gameOver) break;
                
                const playerId = playerOrder[i];
                
                if (playerId === 'player') {
                    // User's turn - skip if folded or out of chips
                    if (gameState.playerFolded || gameState.playerStack === 0) {
                        continue;
                    }
                    
                    const amountToCall = Math.min(gameState.currentBet - gameState.playerBet, gameState.playerStack);
                    
                    if (amountToCall > 0) {
                        // Player needs to respond to a raise - wait for their action
                        const ctrl = document.getElementById('action-controls');
                        if (ctrl) ctrl.style.display = 'flex';
                        updateButtonStates();
                        const msg = document.getElementById('game-message');
                        if (msg) msg.textContent = `Your turn! Call $${amountToCall}, raise, or fold?`;
                        
                        // Exit advancePhase; player action buttons will call advancePhase() again
                        return;
                    }
                } else {
                    // AI player's turn
                    const player = gameState.aiPlayers[playerId.replace('ai', '')];
                    if (!player || player.hasFolded || player.stack <= 0) {
                        continue; // Skip folded or out of chips
                    }
                    
                    const amountToCall = Math.min(gameState.currentBet - player.bet, player.stack);
                    
                    // Act when there is a bet to respond to, OR when no one has bet yet
                    // (currentBet === 0) so the AI can decide to open with a bet or check.
                    if (amountToCall > 0 || gameState.currentBet === 0) {
                        const decision = player.makeDecision(gameState.currentBet, gameState.pot, gameState.communityCards);
                        
                        if (decision === 'fold' && amountToCall > 0) {
                            // Only allow folding when there is actually a bet to escape from.
                            player.hasFolded = true;
                            const msg = document.getElementById('game-message');
                            if (msg) msg.textContent = `${player.name} folded`;
                            
                            // Reveal AI player cards and dim panel
                            const playerIdx = parseInt(playerId.replace('ai', ''));
                            displayAICards(playerIdx, true);
                            // Find this AI player's seat by navigating up from their card container,
                            // rather than using a DOM index (which would be off because the user's
                            // seat sits between AI 0 and AI 1 in the HTML).
                            const aiCardContainer = document.getElementById(`ai-player-${playerIdx}-cards`);
                            const foldedSeat = aiCardContainer ? aiCardContainer.closest('.player-seat') : null;
                            if (foldedSeat) {
                                foldedSeat.classList.add('folded');
                            }
                            
                            bettingContinues = true; // Continue betting round after a fold
                        } else if (decision === 'raise' || decision === 'bet') {
                            // 'raise' responds to an existing bet; 'bet' opens the betting.
                            // When opening (currentBet === 0), start at 2× the big blind.
                            // When raising, go at least 1 big blind above or double the current bet.
                            const raiseAmount = gameState.currentBet === 0
                                ? gameState.bigBlind * 2
                                : Math.max(gameState.currentBet + gameState.bigBlind, gameState.currentBet * 2);
                            const bet = Math.min(raiseAmount - player.bet, player.stack);
                            if (bet > 0) {
                                player.bet += bet;
                                player.stack -= bet;
                                player.totalBet += bet;
                                gameState.pot += bet;
                                gameState.currentBet = Math.max(gameState.currentBet, player.bet);
                                bettingContinues = true;
                                const msg = document.getElementById('game-message');
                                // Both messages show the total committed by this player for clarity.
                                if (msg) msg.textContent = decision === 'bet'
                                    ? `${player.name} bet $${player.bet}`
                                    : `${player.name} raised to $${player.bet}`;
                            }
                        } else if (decision === 'call') {
                            const bet = amountToCall;
                            if (bet > 0) {
                                player.bet += bet;
                                player.stack -= bet;
                                player.totalBet += bet;
                                gameState.pot += bet;
                                const msg = document.getElementById('game-message');
                                if (msg) msg.textContent = `${player.name} called $${bet}`;
                            } else {
                                // 'call' with nothing to call means the AI is checking.
                                const msg = document.getElementById('game-message');
                                if (msg) msg.textContent = `${player.name} checked`;
                            }
                        } else {
                            // 'check' — or 'fold' when there is no bet to escape (treated as check).
                            const msg = document.getElementById('game-message');
                            if (msg) msg.textContent = `${player.name} checked`;
                        }
                        
                        updateDisplay();
                        await new Promise(r => setTimeout(r, 800));
                    }
                }
            }
        }

        // Re-check active players after betting (AIs may have folded during the round)
        if (countActivePlayers() <= 1) {
            showdown();
            return;
        }

        // Betting round is done - move to next phase with a 1-second delay before card reveal
        let phaseMessage = '';
        const gameMsg = document.getElementById('game-message');
        if (gameState.gamePhase === 'preFlop' && gameState.deck.length >= 3) {
            if (gameMsg) gameMsg.textContent = 'Dealing the Flop...';
            await new Promise(r => setTimeout(r, CARD_REVEAL_DELAY_MS));
            gameState.gamePhase = 'flop';
            gameState.communityCards.push(gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop());
            displayCommunityCards(3); // animate all 3 flop cards
            updateCurrentHand();
            displayPossibleHands();
            phaseMessage = 'FLOP revealed! Your turn to bet.';
            resetBets();
        } else if (gameState.gamePhase === 'flop' && gameState.deck.length >= 1) {
            if (gameMsg) gameMsg.textContent = 'Dealing the Turn...';
            await new Promise(r => setTimeout(r, CARD_REVEAL_DELAY_MS));
            gameState.gamePhase = 'turn';
            gameState.communityCards.push(gameState.deck.pop());
            displayCommunityCards(1); // animate the 1 new turn card
            updateCurrentHand();
            displayPossibleHands();
            phaseMessage = 'TURN revealed! Your turn to bet.';
            resetBets();
        } else if (gameState.gamePhase === 'turn' && gameState.deck.length >= 1) {
            if (gameMsg) gameMsg.textContent = 'Dealing the River...';
            await new Promise(r => setTimeout(r, CARD_REVEAL_DELAY_MS));
            gameState.gamePhase = 'river';
            gameState.communityCards.push(gameState.deck.pop());
            displayCommunityCards(1); // animate the 1 new river card
            updateCurrentHand();
            displayPossibleHands();
            phaseMessage = 'RIVER revealed! Last chance to bet.';
            resetBets();
        } else {
            showdown();
            return;
        }

        // Player is all-in when they have no chips left but haven't folded.
        // In that case they can't bet, so we auto-advance just like when folded.
        const isPlayerAllIn = !gameState.playerFolded && gameState.playerStack === 0;

        if (gameState.playerFolded || isPlayerAllIn) {
            // Player has folded or is all-in - auto-advance so AI players finish betting
            let aiPhaseMsg;
            if (isPlayerAllIn) {
                aiPhaseMsg = `${gameState.gamePhase.toUpperCase()} revealed! You're all-in — watching AI bet...`;
            } else if (gameState.gamePhase === 'river') {
                aiPhaseMsg = 'RIVER revealed! AI players betting...';
            } else {
                aiPhaseMsg = `${gameState.gamePhase.toUpperCase()} revealed! AI players betting...`;
            }
            if (gameMsg) gameMsg.textContent = aiPhaseMsg;
            setTimeout(() => advancePhase(), 800);
        } else {
            // Show action controls so the player can bet on the new street
            if (gameMsg) gameMsg.textContent = phaseMessage;
            const ctrl = document.getElementById('action-controls');
            if (ctrl) ctrl.style.display = 'flex';
            updateButtonStates();
        }
    }

    function resetBets() {
        gameState.playerBet = 0;
        gameState.currentBet = 0;
        gameState.aiPlayers.forEach(p => p.bet = 0);
        displayPossibleHands();
        updateCurrentHand();
        updateDisplay();
    }

    function showdown() {
        gameState.gameOver = true;
        gameState.roundOver = true;
        const ctrl = document.getElementById('action-controls');
        if (ctrl) ctrl.style.display = 'none';

        // Reveal all cards for AIs who were actually dealt in (eliminated AIs have no cards)
        gameState.aiPlayers.forEach((p, i) => {
            if (p.hand.length > 0) displayAICards(i, true);
        });

        // --- Sole survivor: all other players folded ---
        // When only 1 player is still in (everyone else folded), we award the pot without
        // needing to compare full 5-card hands.  This prevents odd results when few or no
        // community cards have been dealt yet.
        const nonFoldedAIs = gameState.aiPlayers.filter(ai => !ai.hasFolded && ai.hand.length > 0);
        const activePlayers = (gameState.playerFolded ? 0 : 1) + nonFoldedAIs.length;

        if (activePlayers <= 1) {
            if (!gameState.playerFolded) {
                // Human player is the last one standing
                displayWinner({ player: 'player', rank: 'Everyone else folded!', score: 0, cards: [] });
            } else if (nonFoldedAIs.length === 1) {
                // One AI is the last one standing
                const winner = nonFoldedAIs[0];
                displayWinner({ player: winner.name, rank: 'Everyone else folded!', score: 0, cards: [], aiPlayer: winner });
            } else {
                // Extremely rare edge case: all players folded simultaneously.
                // Award the pot to the player with the most chips to avoid a dead pot.
                const topAI = gameState.aiPlayers.reduce((best, p) => p.stack > best.stack ? p : best, gameState.aiPlayers[0]);
                displayWinner({ player: topAI.name, rank: 'Everyone folded!', score: 0, cards: [], aiPlayer: topAI });
            }
            return;
        }

        // --- Normal showdown: compare hands ---
        let bestHand = { player: 'player', rank: 'None', score: -1 };

        if (!gameState.playerFolded) {
            const allCards = [...gameState.playerHand, ...gameState.communityCards];
            const playerHand = HandEvaluator.findBestHand(allCards);
            const playerRank = HandEvaluator.classifyHand(playerHand);
            bestHand = { player: 'player', rank: playerRank, score: playerHand.score, cards: playerHand.hand };
        }

        gameState.aiPlayers.forEach(ai => {
            if (!ai.hasFolded && ai.hand.length > 0) {
                const allCards = [...ai.hand, ...gameState.communityCards];
                const aiHand = HandEvaluator.findBestHand(allCards);
                const aiRank = HandEvaluator.classifyHand(aiHand);
                if (aiHand.score > bestHand.score) {
                    bestHand = { player: ai.name, rank: aiRank, score: aiHand.score, cards: aiHand.hand, aiPlayer: ai };
                }
            }
        });

        displayWinner(bestHand);
    }

    function displayWinner(winner) {
        const winnerInfo = document.getElementById('winner-info');
        if (!winnerInfo) return;

        // Check if player won (all opponents out of chips)
        if (winner.player === 'player') {
            gameState.playerStack += gameState.pot;
            gameState.roundsWon++;
            // Update highest hand
            const handRanks = [
                'Royal Flush', 'Straight Flush', 'Four of a Kind', 'Full House', 'Flush',
                'Straight', 'Three of a Kind', 'Two Pair', 'Pair', 'High Card'
            ];
            const currentHandRank = handRanks.indexOf(winner.rank);
            const highestHandRank = gameState.highestHand ? handRanks.indexOf(gameState.highestHand) : 10;
            if (currentHandRank < highestHandRank) {
                gameState.highestHand = winner.rank;
            }
            
            const allAIOuts = gameState.aiPlayers.every(p => p.stack <= 0);
            if (allAIOuts) {
                // You won the whole game!
                setTimeout(() => displayYouWinScreen(), 2000);
                return;
            }
        }
        
        // AI player wins - add pot to their stack
        if (winner.aiPlayer) {
            winner.aiPlayer.stack += gameState.pot;
        }

        let html = '<div class="winner-name">' + (winner.player === 'player' ? 'YOU WIN!' : winner.player + ' WINS!') + '</div>';
        html += '<div class="winner-hand">' + winner.rank + '</div>';
        html += '<div class="winner-cards">';
        if (winner.cards) {
            winner.cards.forEach(card => {
                html += '<div class="card winner-card" style="width: 60px; height: 84px;"><img src="' + card.getImagePath() + '" style="width: 90%; height: 90%;"/></div>';
            });
        }
        html += '</div>';
        html += '<div class="pot-won">Pot: $' + gameState.pot + '</div>';
        html += '<div class="winner-actions"><button id="play-again-modal" class="btn btn-success">Next Hand</button><button id="quit-modal" class="btn btn-danger">Quit</button></div>';

        winnerInfo.innerHTML = html;
        winnerInfo.style.display = 'block';

        // Add backdrop overlay
        let overlay = document.querySelector('.modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';

        // Attach event listeners to buttons inside modal
        const playAgainBtn = document.getElementById('play-again-modal');
        if (playAgainBtn) {
            playAgainBtn.onclick = () => {
                const overlay = document.querySelector('.modal-overlay');
                if (overlay) overlay.style.display = 'none';
                winnerInfo.style.display = 'none';
                gameState.dealerPosition = (gameState.dealerPosition + 1) % 3;
                gameState.smallBlindPos = (gameState.smallBlindPos + 1) % 3;
                gameState.bigBlindPos = (gameState.bigBlindPos + 1) % 3;
                startNewHand();
            };
        }
        const quitBtn = document.getElementById('quit-modal');
        if (quitBtn) {
            quitBtn.onclick = () => {
                displayQuitScreen();
            };
        }

        // Check if player is out of chips - show lose screen instead of next hand option
        if (gameState.playerStack <= 0) {
            setTimeout(() => displayLoseScreen(), 2000);
        }
    }

    function displayLoseScreen() {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.style.display = 'none';
        const winnerInfo = document.getElementById('winner-info');
        if (winnerInfo) winnerInfo.style.display = 'none';

        // Create lose screen if it doesn't exist
        let loseScreen = document.getElementById('lose-screen');
        if (!loseScreen) {
            loseScreen = document.createElement('div');
            loseScreen.id = 'lose-screen';
            loseScreen.className = 'quit-screen';
            document.body.appendChild(loseScreen);
        }

        const finalStack = gameState.playerStack;
        const chipChange = finalStack - gameState.initialStack;
        const chipChangeDisplay = chipChange >= 0 ? '+$' + chipChange : '-$' + Math.abs(chipChange);
        const highestHand = gameState.highestHand || 'None';

        // Save the all-time score so losing a session still counts
        // Updates localStorage with total chip change across all sessions and returns the new total
        const lifetimeScore = saveLifetimeScore(chipChange);

        let html = '<div class="quit-card-content">';
        html += '<div class="quit-title lose-title">You lost!</div>';
        html += '<div class="quit-subtitle">All your chips have been bet.</div>';
        // Creates HTML showing 'Career Debt: $X' or 'Career Winnings: $X' based on all-time chip total
        html += buildLifetimeScoreHTML(lifetimeScore);
        html += '<div class="quit-stat"><span class="quit-label">Final Chips:</span><span class="quit-value">$' + finalStack + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Chip Change:</span><span class="quit-value ' + (chipChange >= 0 ? 'positive' : 'negative') + '\">' + chipChangeDisplay + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Highest Hand:</span><span class="quit-value">' + highestHand + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Rounds Won:</span><span class="quit-value">' + gameState.roundsWon + '</span></div>';
        html += '<div class="quit-btn-group"><button id="lose-new-round" class="quit-btn quit-btn-play">NEW<br>ROUND</button></div>';
        html += '</div>';

        loseScreen.innerHTML = html;
        loseScreen.style.display = 'block';

        // "New Round" resets everyone to 500 chips and starts fresh
        const newRoundBtn = document.getElementById('lose-new-round');
        if (newRoundBtn) {
            newRoundBtn.onclick = () => resetGameForNewRound(loseScreen);
        }

        // Hide all game elements
        const actionCtrl = document.getElementById('action-controls');
        if (actionCtrl) actionCtrl.style.display = 'none';
        const betInput = document.getElementById('bet-input-section');
        if (betInput) betInput.style.display = 'none';
        const introCtrl = document.getElementById('intro-controls');
        if (introCtrl) introCtrl.style.display = 'none';
    }

    function displayYouWinScreen() {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.style.display = 'none';
        const winnerInfo = document.getElementById('winner-info');
        if (winnerInfo) winnerInfo.style.display = 'none';

        // Create win screen if it doesn't exist
        let winScreen = document.getElementById('win-screen');
        if (!winScreen) {
            winScreen = document.createElement('div');
            winScreen.id = 'win-screen';
            winScreen.className = 'quit-screen';
            document.body.appendChild(winScreen);
        }

        const finalStack = gameState.playerStack;
        const chipChange = finalStack - gameState.initialStack;
        const chipChangeDisplay = chipChange >= 0 ? '+$' + chipChange : '-$' + Math.abs(chipChange);
        const highestHand = gameState.highestHand || 'None';

        let html = '<div class="quit-card-content">';
        html += '<div class="quit-title win-title">YOU WIN!</div>';
        html += '<div class="quit-subtitle">You defeated all opponents!</div>';
        html += '<div class="quit-stat"><span class="quit-label">Final Chips:</span><span class="quit-value">$' + finalStack + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Chip Change:</span><span class="quit-value ' + (chipChange >= 0 ? 'positive' : 'negative') + '\">' + chipChangeDisplay + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Highest Hand:</span><span class="quit-value">' + highestHand + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Rounds Won:</span><span class="quit-value">' + gameState.roundsWon + '</span></div>';
        html += '<div class="quit-btn-group"><button id="win-play-again" class="quit-btn quit-btn-play">PLAY<br>AGAIN</button><button id="win-quit" class="quit-btn quit-btn-quit">QUIT</button></div>';
        html += '</div>';

        winScreen.innerHTML = html;
        winScreen.style.display = 'block';

        // Add event listeners
        const playAgainBtn = document.getElementById('win-play-again');
        if (playAgainBtn) {
            playAgainBtn.onclick = () => {
                // Reset game and start new session
                gameState.playerStack = 500;
                gameState.roundsWon = 0;
                gameState.highestHand = null;
                gameState.initialStack = 500;
                gameState.aiPlayers.forEach(p => {
                    p.stack = 500;
                    p.bet = 0;
                    p.totalBet = 0;
                    p.hasFolded = false;
                });
                winScreen.style.display = 'none';
                gameState.dealerPosition = (gameState.dealerPosition + 1) % 3;
                gameState.smallBlindPos = (gameState.smallBlindPos + 1) % 3;
                gameState.bigBlindPos = (gameState.bigBlindPos + 1) % 3;
                startNewHand();
            };
        }
        const quitBtn = document.getElementById('win-quit');
        if (quitBtn) {
            quitBtn.onclick = () => {
                displayQuitScreen();
            };
        }

        // Hide all game elements
        const actionCtrl = document.getElementById('action-controls');
        if (actionCtrl) actionCtrl.style.display = 'none';
        const betInput = document.getElementById('bet-input-section');
        if (betInput) betInput.style.display = 'none';
        const introCtrl = document.getElementById('intro-controls');
        if (introCtrl) introCtrl.style.display = 'none';
    }

    // --- Lifetime score helpers (stored in the browser so it persists between visits) ---

    // Resets all player and AI chip counts to 500, clears stats, and starts a new hand.
    // Call this when the player clicks "NEW ROUND" from any end-of-game screen.
    // screenToHide is the DOM element (quit or lose screen overlay) to close before starting the hand.
    function resetGameForNewRound(screenToHide) {
        gameState.playerStack = 500;
        gameState.roundsWon = 0;
        gameState.highestHand = null;
        gameState.initialStack = 500;
        // Loop through each AI opponent and reset their chip stack to 500, clearing any leftover bets
        gameState.aiPlayers.forEach(p => {
            p.stack = 500;
            p.bet = 0;
            p.totalBet = 0;
            p.hasFolded = false;
        });
        if (screenToHide) screenToHide.style.display = 'none';
        gameState.dealerPosition = (gameState.dealerPosition + 1) % 3;
        gameState.smallBlindPos = (gameState.smallBlindPos + 1) % 3;
        gameState.bigBlindPos = (gameState.bigBlindPos + 1) % 3;
        startNewHand();
    }

    // Returns true if this browser has a saved score (i.e. the player has played before).
    function isReturningPlayer() {
        return localStorage.getItem('vibepoker_score') !== null;
    }

    // Reads the player's all-time score from localStorage. Returns 0 for first-time visitors.
    function loadLifetimeScore() {
        const stored = localStorage.getItem('vibepoker_score');
        // parseInt needs the second argument (10) to ensure we always use base-10 numbers
        return stored !== null ? parseInt(stored, 10) : 0;
    }

    // Adds this session's chip change to the all-time score and saves it.
    function saveLifetimeScore(chipChange) {
        const current = loadLifetimeScore();
        const updated = current + chipChange;
        // localStorage can only store strings, so we convert the number to text before saving
        localStorage.setItem('vibepoker_score', updated.toString());
        return updated;
    }

    // Builds the HTML for the WINNINGS / DEBT line shown on the quit screen.
    function buildLifetimeScoreHTML(lifetimeScore) {
        const label = lifetimeScore >= 0 ? 'WINNINGS' : 'DEBT';
        const cssClass = lifetimeScore >= 0 ? 'positive' : 'negative';
        const display = '$' + Math.abs(lifetimeScore);
        return `<div class="quit-stat quit-stat-lifetime"><span class="quit-label quit-label-lifetime">${label}:</span><span class="quit-value quit-value-lifetime ${cssClass}">${display}</span></div>`;
    }

    function displayQuitScreen() {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.style.display = 'none';
        const winnerInfo = document.getElementById('winner-info');
        if (winnerInfo) winnerInfo.style.display = 'none';

        // Create quit screen if it doesn't exist
        let quitScreen = document.getElementById('quit-screen');
        if (!quitScreen) {
            quitScreen = document.createElement('div');
            quitScreen.id = 'quit-screen';
            quitScreen.className = 'quit-screen';
            document.body.appendChild(quitScreen);
        }

        const finalStack = gameState.playerStack;
        const chipChange = finalStack - gameState.initialStack;
        const chipChangeDisplay = chipChange >= 0 ? '+$' + chipChange : '-$' + Math.abs(chipChange);
        const highestHand = gameState.highestHand || 'None';

        // Update and retrieve the all-time score for this player
        const lifetimeScore = saveLifetimeScore(chipChange);

        let html = '<div class="quit-card-content">';
        html += '<div class="quit-title">Thanks for Playing!</div>';
        html += buildLifetimeScoreHTML(lifetimeScore);
        html += '<div class="quit-stat"><span class="quit-label">Final Chips:</span><span class="quit-value">$' + finalStack + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Chip Change:</span><span class="quit-value ' + (chipChange >= 0 ? 'positive' : 'negative') + '">' + chipChangeDisplay + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Highest Hand:</span><span class="quit-value">' + highestHand + '</span></div>';
        html += '<div class="quit-stat"><span class="quit-label">Rounds Won:</span><span class="quit-value">' + gameState.roundsWon + '</span></div>';
        html += '<div class="quit-btn-group"><button id="quit-new-round" class="quit-btn quit-btn-play">NEW<br>ROUND</button></div>';
        html += '</div>';

        quitScreen.innerHTML = html;
        quitScreen.style.display = 'block';

        // "New Round" resets everyone to 500 chips and starts fresh
        const newRoundBtn = document.getElementById('quit-new-round');
        if (newRoundBtn) {
            newRoundBtn.onclick = () => resetGameForNewRound(quitScreen);
        }

        // Hide all game elements
        const actionCtrl = document.getElementById('action-controls');
        if (actionCtrl) actionCtrl.style.display = 'none';
        const betInput = document.getElementById('bet-input-section');
        if (betInput) betInput.style.display = 'none';
        const introCtrl = document.getElementById('intro-controls');
        if (introCtrl) introCtrl.style.display = 'none';
    }

    try {
        showIntroStep();
        updateDisplay();

        // If this player has visited before, let them skip straight to the game
        if (isReturningPlayer()) {
            const startBtn = document.getElementById('start-game');
            if (startBtn) startBtn.style.display = 'inline-block';
        }
    } catch (e) {
        console.error('Error starting game:', e);
    }
});
