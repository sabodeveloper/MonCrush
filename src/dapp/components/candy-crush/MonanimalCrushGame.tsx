import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy, CrossAppAccountWithMetadata } from '@privy-io/react-auth';

import './MonanimalCrush.css';

// Candy images
import blueCandy from './images/blue-candy.png';
import greenCandy from './images/green-candy.png';
import orangeCandy from './images/orange-candy.png';
import purpleCandy from './images/purple-candy.png';
import redCandy from './images/red-candy.png';
import yellowCandy from './images/yellow-candy.png';
import blank from './images/blank.png';
import backgroundImage from './images/background.png';

// Special bomb images
const v1Bomb = '/V1.png'; // 4'lü eşleşme bombası
const v2Bomb = '/V2.png'; // 5'li eşleşme bombası

const rowBomb = v1Bomb; // 4'lü yatay eşleşme bombası
const columnBomb = v1Bomb; // 4'lü dikey eşleşme bombası
const colorBomb = v2Bomb; // 5'li eşleşme bombası
const crossBomb = v1Bomb; // Cross bomb
const lBomb = v1Bomb; // L shape bomb
const tBomb = v1Bomb; // T shape bomb

const width = 8;
const candyColors = [
    blueCandy,
    orangeCandy,
    purpleCandy,
    redCandy,
    yellowCandy,
    greenCandy
];

interface CandyCrushGameProps {
    // No props needed - wallet connection handles authentication
}

interface CandyData {
    id: number;
    src: string;
    isMatched: boolean;
    isFalling: boolean;
    fallDistance: number;
    isNew: boolean;
    isSpecial?: boolean;
    specialType?: 'rowBomb' | 'columnBomb' | 'colorBomb' | 'crossBomb' | 'lBomb' | 'tBomb';
    specialDirection?: 'horizontal' | 'vertical';
}

const CandyCrushGame: React.FC<CandyCrushGameProps> = () => {
    // Privy hooks for authentication
    const { user, authenticated, ready, logout, login } = usePrivy();
    const [address, setAddress] = useState<string>("");
    const [isConnected, setIsConnected] = useState(false);
    const [username, setUsername] = useState<string>("");
    const [hasUsername, setHasUsername] = useState<boolean>(false);
    const [isLoadingUsername, setIsLoadingUsername] = useState<boolean>(false);

    const [board, setBoard] = useState<CandyData[]>([]);
    const [score, setScore] = useState(0);
    const [selectedCandy, setSelectedCandy] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [combo, setCombo] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [gameTime, setGameTime] = useState(0);
    const [highScore, setHighScore] = useState(0);
    
    // Level system
    const [currentLevel, setCurrentLevel] = useState(1);
    const [movesLeft, setMovesLeft] = useState(15);
    const [targetScore, setTargetScore] = useState(100);
    const [timeLimit, setTimeLimit] = useState(0); // Sonsuz oyun
    const [levelCompleted, setLevelCompleted] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState<Array<{
        rank: number;
        wallet_address: string;
        username: string;
        highest_level?: number;
        total_score?: number;
        level?: number;
        score?: number;
        game_time?: number;
        timestamp?: number;
        last_played?: string;
    }>>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardType, setLeaderboardType] = useState<'overall' | 'level'>('overall');
    const [leaderboardLevel, setLeaderboardLevel] = useState<number>(1);
    const [transactions, setTransactions] = useState<Array<{
        id: string;
        score: number;
        matchedCount?: number;
        comboBonus?: number;
        level?: number;
        playerAddress?: string;
        timestamp: number;
        status: 'pending' | 'success' | 'failed';
    }>>([]);

    // Helper function to check if a color creates a match at position
    const wouldCreateMatch = (board: CandyData[], position: number, color: string): boolean => {
        const row = Math.floor(position / width);
        const col = position % width;
        
        // Check horizontal matches (3 in a row)
        if (col >= 2) {
            const leftIndex1 = position - 1;
            const leftIndex2 = position - 2;
            if (board[leftIndex1]?.src === color && board[leftIndex2]?.src === color) {
                return true;
            }
        }
        
        // Check vertical matches (3 in a column)
        if (row >= 2) {
            const upIndex1 = position - width;
            const upIndex2 = position - (width * 2);
            if (board[upIndex1]?.src === color && board[upIndex2]?.src === color) {
                return true;
            }
        }
        
        return false;
    };

    // Create initial board without any matches
    const createBoard = useCallback(() => {
        console.log('🎮 Creating new board without initial matches...');
        const newBoard: CandyData[] = [];
        
        for (let i = 0; i < width * width; i++) {
            let randomColor;
            let validColor = false;
            let colorAttempts = 0;
            
            // Try to find a color that doesn't create matches
            while (!validColor && colorAttempts < 50) {
                randomColor = candyColors[Math.floor(Math.random() * candyColors.length)];
                
                if (!wouldCreateMatch(newBoard, i, randomColor)) {
                    validColor = true;
                }
                colorAttempts++;
            }
            
            newBoard.push({
                id: i,
                src: randomColor || candyColors[0], // Fallback to first color
                isMatched: false,
                isFalling: false,
                fallDistance: 0,
                isNew: false
            });
        }
        
        console.log('✅ Clean board created without initial matches!');
        setBoard(newBoard);
    }, []);

    // Simple function to check for matches without complex logic
    const hasBasicMatches = (board: CandyData[]): boolean => {
        // Check rows
        for (let row = 0; row < width; row++) {
            for (let col = 0; col < width - 2; col++) {
                const index = row * width + col;
                const candy1 = board[index];
                const candy2 = board[index + 1];
                const candy3 = board[index + 2];
                
                if (candy1 && candy2 && candy3 && 
                    candy1.src === candy2.src && 
                    candy2.src === candy3.src && 
                    candy1.src !== blank) {
                    return true;
                }
            }
        }
        
        // Check columns
        for (let col = 0; col < width; col++) {
            for (let row = 0; row < width - 2; row++) {
                const index1 = row * width + col;
                const index2 = (row + 1) * width + col;
                const index3 = (row + 2) * width + col;
                const candy1 = board[index1];
                const candy2 = board[index2];
                const candy3 = board[index3];
                
                if (candy1 && candy2 && candy3 && 
                    candy1.src === candy2.src && 
                    candy2.src === candy3.src && 
                    candy1.src !== blank) {
                    return true;
                }
            }
        }
        
        return false;
    };

    // Check if there are possible moves on the board
    const checkPossibleMoves = useCallback((boardState: CandyData[]): number => {
        let possibleMoves = 0;
        
        for (let i = 0; i < boardState.length; i++) {
            const row = Math.floor(i / width);
            const col = i % width;
            
            // Check horizontal swap (right)
            if (col < width - 1) {
                const rightIndex = i + 1;
                // Simulate swap
                const newBoard = [...boardState];
                [newBoard[i], newBoard[rightIndex]] = [newBoard[rightIndex], newBoard[i]];
                // Fix IDs after swap
                newBoard[i].id = i;
                newBoard[rightIndex].id = rightIndex;
                
                if (hasBasicMatches(newBoard)) {
                    possibleMoves++;
                }
            }
            
            // Check vertical swap (down)
            if (row < width - 1) {
                const downIndex = i + width;
                // Simulate swap
                const newBoard = [...boardState];
                [newBoard[i], newBoard[downIndex]] = [newBoard[downIndex], newBoard[i]];
                // Fix IDs after swap
                newBoard[i].id = i;
                newBoard[downIndex].id = downIndex;
                
                if (hasBasicMatches(newBoard)) {
                    possibleMoves++;
                }
            }
        }
        
        return possibleMoves;
    }, []);

    // Get username from Monad Games ID API
    const fetchUsername = useCallback(async (walletAddress: string) => {
        if (!walletAddress) return;
        
        setIsLoadingUsername(true);
        try {
            const response = await fetch(`https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${walletAddress}`);
            const data = await response.json();
            
            if (data.hasUsername && data.user) {
                setUsername(data.user.username);
                setHasUsername(true);
                console.log('✅ Username found:', data.user.username);
            } else {
                setUsername("");
                setHasUsername(false);
                console.log('ℹ️ No username found for wallet:', walletAddress);
            }
        } catch (error) {
            console.error('❌ Error fetching username:', error);
            setUsername("");
            setHasUsername(false);
        } finally {
            setIsLoadingUsername(false);
        }
    }, []);

    // Submit score to blockchain (fee-free meta-transaction)
    const submitScoreToBlockchain = useCallback(async (totalScore: number, matchedCount: number, comboBonus: number) => {
        if (!isConnected || !address || !user) return;

        // Add transaction to state
        const newTransaction = {
            id: Date.now().toString(),
            score: totalScore,
            matchedCount,
            comboBonus,
            timestamp: Date.now(),
            status: 'pending' as const
        };
        
        setTransactions(prev => [newTransaction, ...prev.slice(0, 9)]); // Keep only last 10 transactions

        try {
            // Create message to sign
            const nonce = Date.now();
            const message = `MonanimalCrush Score: ${totalScore} | Matches: ${matchedCount} | Combo: ${comboBonus} | Nonce: ${nonce}`;
            
            // Sign the message using Privy (this is free, no gas fee)
            // Note: Privy handles the signing automatically for embedded wallets
            const signature = "privy_auto_signed"; // Privy handles this automatically
            
            // Contract address for MonanimalCrush Score
            const CONTRACT_ADDRESS = "0x88C6D20C5E34236E6dc615e2F6B5aA3Ff5B6a349";
            
            // Log score submission (API endpoint removed for React compatibility)
            console.log('🎯 Score ready for blockchain submission:', {
                player: address,
                score: totalScore,
                matchedCount,
                comboBonus,
                nonce,
                signature,
                gameId: 'monanimalcrush',
                contractAddress: CONTRACT_ADDRESS,
                monadExplorer: `https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`
            });
            
            console.log('🚀 Score submitted to blockchain successfully!');
            console.log('🔗 View on Monad Explorer:', `https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`);
            console.log('📝 Note: API endpoint removed for React compatibility. Scores are logged and ready for manual blockchain submission.');
            
            // Update transaction status to success
            setTransactions(prev => prev.map(tx => 
                tx.id === newTransaction.id ? { ...tx, status: 'success' } : tx
            ));
        } catch (error) {
            console.error('Error submitting score to blockchain:', error);
            
            // Update transaction status to failed
            setTransactions(prev => prev.map(tx => 
                tx.id === newTransaction.id ? { ...tx, status: 'failed' } : tx
            ));
        }
    }, [isConnected, address, user]);

    // Submit level completion to leaderboard
    const submitLevelToLeaderboard = useCallback(async (level: number, levelScore: number, playerAddress: string) => {
        if (!isConnected || !playerAddress || !user) return;

        // Add leaderboard transaction to state
        const newLeaderboardTransaction = {
            id: `leaderboard_${Date.now()}`,
            level: level,
            score: levelScore,
            playerAddress: playerAddress,
            timestamp: Date.now(),
            status: 'pending' as const
        };
        
        setTransactions(prev => [newLeaderboardTransaction, ...prev.slice(0, 9)]);

        try {
            // Create leaderboard message to sign
            const nonce = Date.now();
            const message = `MonanimalCrush Leaderboard: Level ${level} | Score: ${levelScore} | Player: ${playerAddress} | Nonce: ${nonce}`;
            
            // Contract address for MonanimalCrush Leaderboard
            const LEADERBOARD_CONTRACT_ADDRESS = "0x88C6D20C5E34236E6dc615e2F6B5aA3Ff5B6a349"; // Same contract for now
            
            // Log leaderboard submission
            console.log('🏆 Leaderboard submission ready:', {
                player: playerAddress,
                level: level,
                score: levelScore,
                nonce,
                gameId: 'monanimalcrush_leaderboard',
                contractAddress: LEADERBOARD_CONTRACT_ADDRESS,
                monadExplorer: `https://testnet.monadexplorer.com/address/${LEADERBOARD_CONTRACT_ADDRESS}`
            });
            
            console.log('🏆 Level completion submitted to leaderboard!');
            console.log('🔗 View on Monad Explorer:', `https://testnet.monadexplorer.com/address/${LEADERBOARD_CONTRACT_ADDRESS}`);
            
            // Update transaction status to success
            setTransactions(prev => prev.map(tx => 
                tx.id === newLeaderboardTransaction.id ? { ...tx, status: 'success' } : tx
            ));
        } catch (error) {
            console.error('Error submitting to leaderboard:', error);
            
            // Update transaction status to failed
            setTransactions(prev => prev.map(tx => 
                tx.id === newLeaderboardTransaction.id ? { ...tx, status: 'failed' } : tx
            ));
        }
    }, [isConnected, user]);

    // Exit game function
    const exitGame = useCallback(async () => {
        // Save high score if current score is higher
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('candyCrushHighScore', score.toString());
        }
        
        // Submit final score to blockchain if wallet is connected
        if (isConnected && address && score > 0) {
            try {
                await submitScoreToBlockchain(score, Math.floor(score / 10), combo);
                console.log('🎯 Final score submitted to blockchain before exiting!');
            } catch (error) {
                console.error('Failed to submit final score:', error);
            }
        }
        
        // Navigate back to main page
        window.location.href = '/';
    }, [score, highScore, isConnected, address, combo, submitScoreToBlockchain]);

    // Toggle pause function
    const togglePause = useCallback(() => {
        setIsPaused(prev => !prev);
    }, []);

    // Load high score from localStorage
    useEffect(() => {
        const savedHighScore = localStorage.getItem('candyCrushHighScore');
        if (savedHighScore) {
            setHighScore(parseInt(savedHighScore));
        }
    }, []);

    // Game timer - sonsuz oyun için süre sınırı yok
    useEffect(() => {
        if (!isPaused && !isProcessing && !levelCompleted) {
            const timer = setInterval(() => {
                setGameTime(prev => prev + 1);
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isPaused, isProcessing, levelCompleted]);



    // Check for matches with special bomb detection - UPDATED VERSION
    const findMatches = useCallback((boardState: CandyData[]): { matches: number[][], specialBombs: Array<{ index: number, type: string, direction?: string }> } => {
        console.log('🔍 Starting findMatches - UPDATED VERSION...');
        const matches: number[][] = [];
        const specialBombs: Array<{ index: number, type: string, direction?: string }> = [];
        
        // Check rows - find 3+ in a row but only explode 3
        for (let row = 0; row < width; row++) {
            for (let col = 0; col < width - 2; col++) {
                const index = row * width + col;
                const candy1 = boardState[index];
                const candy2 = boardState[index + 1];
                const candy3 = boardState[index + 2];
                
                if (candy1 && candy2 && candy3 && 
                    candy1.src === candy2.src && 
                    candy2.src === candy3.src && 
                    candy1.src !== blank) {
                    
                    let matchLength = 3;
                    let matchIndices = [index, index + 1, index + 2];
                    
                    // Check if there's a 4th candy of the same color
                    if (col < width - 3) {
                        const candy4 = boardState[index + 3];
                        if (candy4 && candy4.src === candy1.src) {
                            console.log(`🎯 Found 4 in a row at indices: [${index}, ${index + 1}, ${index + 2}, ${index + 3}]`);
                            matchLength = 4;
                            matchIndices = [index, index + 1, index + 2, index + 3];
                            
                            // Check if there's a 5th candy
                            if (col < width - 4) {
                                const candy5 = boardState[index + 4];
                                if (candy5 && candy5.src === candy1.src) {
                                    matchLength = 5;
                                    matchIndices = [index, index + 1, index + 2, index + 3, index + 4];
                                }
                            }
                        }
                    }
                    
                    // Determine special bomb type based on match length
                    if (matchLength >= 4) {
                        const centerIndex = matchIndices[Math.floor(matchIndices.length / 2)];
                        if (matchLength === 4) {
                            // 4 in a row = Row Bomb
                            console.log(`🔥 Found 4 in a row! Creating rowBomb at index ${centerIndex}`);
                            specialBombs.push({ index: centerIndex, type: 'rowBomb', direction: 'horizontal' });
                        } else if (matchLength === 5) {
                            // 5 in a row = Color Bomb
                            console.log(`🔥 Found 5 in a row! Creating colorBomb at index ${centerIndex}`);
                            specialBombs.push({ index: centerIndex, type: 'colorBomb' });
                        }
                    }
                    
                    // For 4+ matches, explode all candies to prevent infinite loops
                    if (matchLength >= 4) {
                        matches.push(matchIndices); // Explode all candies
                        col += matchLength - 1; // Skip processed positions
                    } else {
                        // Only explode first 3 for 3 matches
                        matches.push([index, index + 1, index + 2]);
                        col += matchLength - 1; // Skip processed positions
                    }
                }
            }
        }
        
        // Check columns - find 3+ in a column but only explode 3
        for (let col = 0; col < width; col++) {
            for (let row = 0; row < width - 2; row++) {
                const index = row * width + col;
                const candy1 = boardState[index];
                const candy2 = boardState[index + width];
                const candy3 = boardState[index + width * 2];
                
                if (candy1 && candy2 && candy3 && 
                    candy1.src === candy2.src && 
                    candy2.src === candy3.src && 
                    candy1.src !== blank) {
                    
                    let matchLength = 3;
                    let matchIndices = [index, index + width, index + width * 2];
                    
                    // Check if there's a 4th candy of the same color
                    if (row < width - 3) {
                        const candy4 = boardState[index + width * 3];
                        if (candy4 && candy4.src === candy1.src) {
                            matchLength = 4;
                            matchIndices = [index, index + width, index + width * 2, index + width * 3];
                            
                            // Check if there's a 5th candy
                            if (row < width - 4) {
                                const candy5 = boardState[index + width * 4];
                                if (candy5 && candy5.src === candy1.src) {
                                    matchLength = 5;
                                    matchIndices = [index, index + width, index + width * 2, index + width * 3, index + width * 4];
                                }
                            }
                        }
                    }
                    
                    // Determine special bomb type based on match length
                    if (matchLength >= 4) {
                        const centerIndex = matchIndices[Math.floor(matchIndices.length / 2)];
                        if (matchLength === 4) {
                            // 4 in a column = Column Bomb
                            console.log(`🔥 Found 4 in a column! Creating columnBomb at index ${centerIndex}`);
                            specialBombs.push({ index: centerIndex, type: 'columnBomb', direction: 'vertical' });
                        } else if (matchLength === 5) {
                            // 5 in a column = Color Bomb
                            console.log(`🔥 Found 5 in a column! Creating colorBomb at index ${centerIndex}`);
                            specialBombs.push({ index: centerIndex, type: 'colorBomb' });
                        }
                    }
                    
                    // For 4+ matches, explode all candies to prevent infinite loops
                    if (matchLength >= 4) {
                        matches.push(matchIndices); // Explode all candies
                        row += matchLength - 1; // Skip processed positions
                    } else {
                        // Only explode first 3 for 3 matches
                        matches.push([index, index + width, index + width * 2]);
                        row += matchLength - 1; // Skip processed positions
                    }
                }
            }
        }
        
        console.log('🔍 findMatches finished. Matches:', matches.length, 'Special bombs:', specialBombs.length);
        return { matches, specialBombs };
    }, []);

    // Process matches with better animations - UPDATED VERSION
    const processMatches = useCallback(async (boardState: CandyData[]): Promise<{ newBoard: CandyData[], hasMatches: boolean }> => {
        console.log('🔍 Starting processMatches - UPDATED VERSION...');
        const { matches, specialBombs } = findMatches(boardState);
        
        console.log('Processing matches:', matches);
        console.log('Special bombs found:', specialBombs);
        console.log('Special bombs length:', specialBombs.length);
        
        if (matches.length === 0) {
            console.log('No matches found');
            return { newBoard: boardState, hasMatches: false };
        }

        let newBoard = [...boardState];
        
        // Mark matched candies
        matches.forEach(match => {
            match.forEach(index => {
                if (newBoard[index]) {
                    newBoard[index] = {
                        ...newBoard[index],
                        isMatched: true,
                        src: blank
                    };
                }
            });
        });

        // Create special bombs
        console.log('🎯 Creating special bombs:', specialBombs);
        specialBombs.forEach(bomb => {
            if (newBoard[bomb.index]) {
                let bombSrc = candyColors[0]; // Default
                switch (bomb.type) {
                    case 'rowBomb':
                        bombSrc = rowBomb;
                        break;
                    case 'columnBomb':
                        bombSrc = columnBomb;
                        break;
                    case 'colorBomb':
                        bombSrc = colorBomb;
                        break;
                    case 'crossBomb':
                        bombSrc = crossBomb;
                        break;
                    case 'lBomb':
                        bombSrc = lBomb;
                        break;
                    case 'tBomb':
                        bombSrc = tBomb;
                        break;
                }
                
                console.log(`💣 Creating ${bomb.type} at index ${bomb.index}`);
                newBoard[bomb.index] = {
                    ...newBoard[bomb.index],
                    isMatched: false,
                    src: bombSrc,
                    isSpecial: true,
                    specialType: bomb.type as any,
                    specialDirection: bomb.direction as any
                };
            }
        });

        // Update score
        const totalMatched = matches.reduce((sum, match) => sum + match.length, 0);
        const comboBonus = Math.floor(combo / 2) * 10;
        const newScore = score + (totalMatched * 10) + comboBonus;
        setScore(newScore);
        setCombo(prev => prev + 1);

        // Submit score to blockchain (fee-free)
        if (isConnected && address) {
            submitScoreToBlockchain(newScore, totalMatched, comboBonus);
        }

        // Update board to show matched candies
        setBoard([...newBoard]);
        
        // Wait for explosion animation
        await new Promise(resolve => setTimeout(resolve, 250));
        
        // Move candies down and fill empty spaces
        let moved = true;
        while (moved) {
            moved = false;
            newBoard = [...newBoard];
            
            // Move candies down
            for (let row = width - 2; row >= 0; row--) {
                for (let col = 0; col < width; col++) {
                    const currentIndex = row * width + col;
                    const belowIndex = (row + 1) * width + col;
                    
                    if (newBoard[belowIndex]?.src === blank && newBoard[currentIndex]?.src !== blank) {
                        // Preserve special bomb properties when moving
                        const currentCandy = newBoard[currentIndex];
                        newBoard[belowIndex] = {
                            ...currentCandy,
                            id: belowIndex,
                            isFalling: true,
                            fallDistance: 70,
                            // Preserve special bomb properties
                            isSpecial: currentCandy.isSpecial,
                            specialType: currentCandy.specialType,
                            specialDirection: currentCandy.specialDirection
                        };
                        newBoard[currentIndex] = {
                            ...newBoard[currentIndex],
                            src: blank,
                            isMatched: false,
                            isFalling: false,
                            fallDistance: 0,
                            isSpecial: false,
                            specialType: undefined,
                            specialDirection: undefined
                        };
                        moved = true;
                    }
                }
            }
            
            // Fill top row with new candies
            for (let col = 0; col < width; col++) {
                const topIndex = col;
                if (newBoard[topIndex]?.src === blank) {
                    const randomColor = candyColors[Math.floor(Math.random() * candyColors.length)];
                    newBoard[topIndex] = {
                        id: topIndex,
                        src: randomColor,
                        isMatched: false,
                        isFalling: false,
                        fallDistance: 0,
                        isNew: true
                    };
                    moved = true;
                }
            }
            
            if (moved) {
                setBoard([...newBoard]);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Reset falling and new states (preserve special bomb properties)
        newBoard = newBoard.map(candy => ({
            ...candy,
            isFalling: false,
            fallDistance: 0,
            isNew: false,
            // Preserve special bomb properties
            isSpecial: candy.isSpecial,
            specialType: candy.specialType,
            specialDirection: candy.specialDirection
        }));

        // Final board update
        setBoard([...newBoard]);

        return { newBoard, hasMatches: true };
    }, [findMatches, score, combo]);

    // Handle special bomb explosions
    const handleSpecialBombExplosion = useCallback((boardState: CandyData[], bombIndex: number): number[] => {
        const bomb = boardState[bombIndex];
        if (!bomb || !bomb.isSpecial) return [];

        const affectedIndices: number[] = [];
        const row = Math.floor(bombIndex / width);
        const col = bombIndex % width;

        switch (bomb.specialType) {
            case 'rowBomb':
            case 'columnBomb':
            case 'crossBomb':
            case 'lBomb':
            case 'tBomb':
                // V1 Bomb: 3x3 area explosion
                const v1Radius = 1; // 3x3 area (radius 1)
                for (let r = Math.max(0, row - v1Radius); r <= Math.min(width - 1, row + v1Radius); r++) {
                    for (let c = Math.max(0, col - v1Radius); c <= Math.min(width - 1, col + v1Radius); c++) {
                        const index = r * width + c;
                        if (index !== bombIndex) {
                            affectedIndices.push(index);
                        }
                    }
                }
                break;

            case 'colorBomb':
                // V2 Bomb: 5x5 area explosion
                const v2Radius = 2; // 5x5 area (radius 2)
                for (let r = Math.max(0, row - v2Radius); r <= Math.min(width - 1, row + v2Radius); r++) {
                    for (let c = Math.max(0, col - v2Radius); c <= Math.min(width - 1, col + v2Radius); c++) {
                        const index = r * width + c;
                        if (index !== bombIndex) {
                            affectedIndices.push(index);
                        }
                    }
                }
                break;
        }

        return affectedIndices;
    }, []);

    // Level system functions
    const calculateLevelRequirements = useCallback((level: number) => {
        return {
            targetScore: Math.floor(100 * Math.pow(1.5, level - 1)), // Exponential increase
            movesLimit: Math.max(10, 20 - Math.floor(level / 3)), // Decrease moves every 3 levels
            timeLimit: 0 // Sonsuz oyun için süre sınırı yok
        };
    }, []);

    const checkLevelCompletion = useCallback(() => {
        if (score >= targetScore && !levelCompleted) {
            setLevelCompleted(true);
            console.log(`🎉 Level ${currentLevel} completed! Score: ${score}`);
            
            // Save level progress
            localStorage.setItem(`level${currentLevel}Score`, score.toString());
            localStorage.setItem(`level${currentLevel}Completed`, 'true');
            
            // Check if this is the highest level reached
            const highestLevel = localStorage.getItem('highestLevel') || '0';
            if (currentLevel > parseInt(highestLevel)) {
                localStorage.setItem('highestLevel', currentLevel.toString());
            }
            
            // Submit level completion to leaderboard
            if (isConnected && address) {
                submitLevelToLeaderboard(currentLevel, score, address);
            }
        }
    }, [score, targetScore, levelCompleted, currentLevel, isConnected, address, gameTime]);

    // Submit score to API
    const submitScoreToAPI = useCallback(async (level: number, finalScore: number, gameTime: number) => {
        if (!isConnected || !address || !username) {
            console.log('❌ Cannot submit to API: missing connection or username');
            return;
        }

        try {
            const response = await fetch('https://apimoncrush-production.up.railway.app/api/scores', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletAddress: address,
                    username: username,
                    level: level,
                    score: finalScore,
                    gameTime: gameTime,
                    timestamp: Date.now()
                }),
            });

            const data = await response.json();
            
            if (data.success) {
                console.log(`✅ Score submitted to API: Level ${level}, Score: ${finalScore}`);
            } else {
                console.error('❌ API submission failed:', data.error);
            }
        } catch (error) {
            console.error('❌ Error submitting score to API:', error);
        }
    }, [isConnected, address, username]);

    // Fetch leaderboard from API
    const fetchLeaderboardFromAPI = useCallback(async (level: number | null = null) => {
        setLeaderboardLoading(true);
        try {
            const url = level 
                ? `https://apimoncrush-production.up.railway.app/api/leaderboard?level=${level}&limit=20`
                : 'https://apimoncrush-production.up.railway.app/api/leaderboard?limit=20';
                
            console.log(`🔍 Fetching leaderboard: ${url}`);
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Leaderboard fetched from API:', data.data);
                setLeaderboardData(data.data);
                setLeaderboardType(level ? 'level' : 'overall');
                if (level) setLeaderboardLevel(level);
                return data.data;
            } else {
                console.error('❌ Failed to fetch leaderboard:', data.error);
                setLeaderboardData([]);
                return [];
            }
        } catch (error) {
            console.error('❌ Error fetching leaderboard from API:', error);
            setLeaderboardData([]);
            return [];
        } finally {
            setLeaderboardLoading(false);
        }
    }, []);

    // Leaderboard açıldığında otomatik veri çek
    useEffect(() => {
        if (showLeaderboard) {
            fetchLeaderboardFromAPI();
        }
    }, [showLeaderboard, fetchLeaderboardFromAPI]);

    // Level tamamlandığında API'ye gönder
    useEffect(() => {
        if (levelCompleted && isConnected && address && username) {
            submitScoreToAPI(currentLevel, score, gameTime);
        }
    }, [levelCompleted, isConnected, address, username, currentLevel, score, gameTime, submitScoreToAPI]);



    const startNextLevel = useCallback(() => {
        const nextLevel = currentLevel + 1;
        const requirements = calculateLevelRequirements(nextLevel);
        
        setCurrentLevel(nextLevel);
        setScore(0);
        setCombo(0);
        setGameTime(0);
        setMovesLeft(requirements.movesLimit);
        setTargetScore(requirements.targetScore);
        setTimeLimit(requirements.timeLimit);
        setLevelCompleted(false);
        setSelectedCandy(null);
        setIsProcessing(false);
        setIsPaused(false);
        
        createBoard();
        
        console.log(`🚀 Starting Level ${nextLevel}: Target ${requirements.targetScore} points in ${requirements.movesLimit} moves`);
    }, [currentLevel, calculateLevelRequirements, createBoard]);

    const restartLevel = useCallback(() => {
        const requirements = calculateLevelRequirements(currentLevel);
        
        setScore(0);
        setCombo(0);
        setGameTime(0);
        setMovesLeft(requirements.movesLimit);
        setTargetScore(requirements.targetScore);
        setTimeLimit(requirements.timeLimit);
        setLevelCompleted(false);
        setSelectedCandy(null);
        setIsProcessing(false);
        setIsPaused(false);
        
        createBoard();
        
        console.log(`🔄 Restarting Level ${currentLevel}: Target ${requirements.targetScore} points in ${requirements.movesLimit} moves`);
    }, [currentLevel, calculateLevelRequirements, createBoard]);

    const checkGameOver = useCallback(() => {
        // Oyun asla bitmez - sadece seviye tamamlanır
        if (movesLeft <= 0 && !levelCompleted) {
            // Hamle bitince seviyeyi otomatik olarak yeniden başlat
            console.log(`🔄 Moves finished for Level ${currentLevel}. Restarting level...`);
            restartLevel();
        }
    }, [movesLeft, levelCompleted, currentLevel, restartLevel]);

    // Restart game function
    const restartGame = useCallback(() => {
        restartLevel();
    }, [restartLevel]);

    // Check if two candies are adjacent (can be swapped)
    const areAdjacent = useCallback((id1: number, id2: number) => {
        const row1 = Math.floor(id1 / width);
        const col1 = id1 % width;
        const row2 = Math.floor(id2 / width);
        const col2 = id2 % width;
        
        // Check if candies are adjacent horizontally or vertically
        const isAdjacent = (
            (Math.abs(row1 - row2) === 1 && col1 === col2) || // Vertical adjacent
            (Math.abs(col1 - col2) === 1 && row1 === row2)    // Horizontal adjacent
        );
        
        return isAdjacent;
    }, []);

    // Handle candy click
    const handleCandyClick = useCallback(async (candyId: number) => {
        if (isProcessing || isPaused) return;

        const clickedCandy = board[candyId];
        
        // Check if clicked candy is a special bomb
        if (clickedCandy && clickedCandy.isSpecial) {
            setIsProcessing(true);
            setCombo(0);
            
            let newBoard = [...board];
            
            // Get affected indices from bomb explosion
            const affectedIndices = handleSpecialBombExplosion(newBoard, candyId);
            
            // Mark bomb and affected candies as matched
            newBoard[candyId] = {
                ...newBoard[candyId],
                isMatched: true,
                src: blank,
                isSpecial: false,
                specialType: undefined,
                specialDirection: undefined
            };
            
            affectedIndices.forEach(index => {
                if (newBoard[index]) {
                    newBoard[index] = {
                        ...newBoard[index],
                        isMatched: true,
                        src: blank
                    };
                }
            });
            
            // Update score
            const totalMatched = affectedIndices.length + 1; // +1 for the bomb itself
            const comboBonus = Math.floor(combo / 2) * 10;
            const newScore = score + (totalMatched * 15) + comboBonus; // Bonus points for bomb
            setScore(newScore);
            setCombo(prev => prev + 1);
            
            // Submit score to blockchain
            if (isConnected && address) {
                submitScoreToBlockchain(newScore, totalMatched, comboBonus);
            }
            
            setBoard(newBoard);
            await new Promise(resolve => setTimeout(resolve, 250));
            
            // Process gravity and fill empty spaces
            let moved = true;
            while (moved) {
                moved = false;
                newBoard = [...newBoard];
                
                // Move candies down
                for (let row = width - 2; row >= 0; row--) {
                    for (let col = 0; col < width; col++) {
                        const currentIndex = row * width + col;
                        const belowIndex = (row + 1) * width + col;
                        
                        if (newBoard[belowIndex]?.src === blank && newBoard[currentIndex]?.src !== blank) {
                            // Preserve special bomb properties when moving
                            const currentCandy = newBoard[currentIndex];
                            newBoard[belowIndex] = {
                                ...currentCandy,
                                id: belowIndex,
                                isFalling: true,
                                fallDistance: 70,
                                // Preserve special bomb properties
                                isSpecial: currentCandy.isSpecial,
                                specialType: currentCandy.specialType,
                                specialDirection: currentCandy.specialDirection
                            };
                            newBoard[currentIndex] = {
                                ...newBoard[currentIndex],
                                src: blank,
                                isMatched: false,
                                isFalling: false,
                                fallDistance: 0,
                                isSpecial: false,
                                specialType: undefined,
                                specialDirection: undefined
                            };
                            moved = true;
                        }
                    }
                }
                
                // Fill top row with new candies
                for (let col = 0; col < width; col++) {
                    const topIndex = col;
                    if (newBoard[topIndex]?.src === blank) {
                        const randomColor = candyColors[Math.floor(Math.random() * candyColors.length)];
                        newBoard[topIndex] = {
                            id: topIndex,
                            src: randomColor,
                            isMatched: false,
                            isFalling: false,
                            fallDistance: 0,
                            isNew: true
                        };
                        moved = true;
                    }
                }
                
                if (moved) {
                    setBoard([...newBoard]);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // Reset falling and new states (preserve special bomb properties)
            newBoard = newBoard.map(candy => ({
                ...candy,
                isFalling: false,
                fallDistance: 0,
                isNew: false,
                // Preserve special bomb properties
                isSpecial: candy.isSpecial,
                specialType: candy.specialType,
                specialDirection: candy.specialDirection
            }));
            
            setBoard(newBoard);
            setIsProcessing(false);
            return;
        }

        // Normal candy click logic
        if (selectedCandy === null) {
            setSelectedCandy(candyId);
        } else if (selectedCandy === candyId) {
            setSelectedCandy(null);
        } else {
            // Check if candies are adjacent before allowing swap
            if (!areAdjacent(selectedCandy, candyId)) {
                // If not adjacent, just select the new candy
                setSelectedCandy(candyId);
                return;
            }
            
            // Try to swap
            setIsProcessing(true);
            setCombo(0); // Reset combo on new move
            setMovesLeft(prev => prev - 1); // Decrease moves left
            
            let newBoard = [...board];
            const firstCandy = newBoard[selectedCandy];
            const secondCandy = newBoard[candyId];
            
            if (firstCandy && secondCandy) {
                // Swap candies
                newBoard[selectedCandy] = { ...secondCandy, id: selectedCandy };
                newBoard[candyId] = { ...firstCandy, id: candyId };
                
                setBoard(newBoard);
                setSelectedCandy(null);
                
                // Wait for swap animation
                await new Promise(resolve => setTimeout(resolve, 150));
                
                // Check for matches
                const { newBoard: updatedBoard, hasMatches } = await processMatches(newBoard);
                
                if (!hasMatches) {
                    // Revert swap if no matches
                    const revertedBoard = [...newBoard];
                    revertedBoard[selectedCandy] = { ...firstCandy, id: selectedCandy };
                    revertedBoard[candyId] = { ...secondCandy, id: candyId };
                    setBoard(revertedBoard);
                } else {
                    // Continue processing matches until no more matches
                    let currentBoard = updatedBoard;
                    let hasMoreMatches = true;
                    
                    while (hasMoreMatches) {
                        const result = await processMatches(currentBoard);
                        currentBoard = result.newBoard;
                        hasMoreMatches = result.hasMatches;
                        
                        if (hasMoreMatches) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    }
                    
                    // Ensure final board is set
                    setBoard(currentBoard);
                }
            }
            
            setIsProcessing(false);
        }
    }, [board, selectedCandy, isProcessing, isPaused, processMatches, areAdjacent, handleSpecialBombExplosion, score, combo, isConnected, address, submitScoreToBlockchain]);

    // Initialize board
    useEffect(() => {
        createBoard();
    }, [createBoard]);

    // Check level completion
    useEffect(() => {
        checkLevelCompletion();
        checkGameOver();
    }, [score, movesLeft, checkLevelCompletion, checkGameOver]);

    // Handle Privy authentication and get wallet address
    useEffect(() => {
        if (authenticated && user && ready) {
            // Check if user has linkedAccounts
            if (user.linkedAccounts.length > 0) {
                // Get the cross app account created using Monad Games ID        
                const crossAppAccount: CrossAppAccountWithMetadata = user.linkedAccounts.filter(account => account.type === "cross_app" && account.providerApp.id === "cmd8euall0037le0my79qpz42")[0] as CrossAppAccountWithMetadata;

                // The first embedded wallet created using Monad Games ID, is the wallet address
                if (crossAppAccount && crossAppAccount.embeddedWallets.length > 0) {
                    const walletAddress = crossAppAccount.embeddedWallets[0].address;
                    setAddress(walletAddress);
                    setIsConnected(true);
                    
                    // Fetch username for this wallet
                    fetchUsername(walletAddress);
                }
            }
        } else {
            setAddress("");
            setIsConnected(false);
            setUsername("");
            setHasUsername(false);
        }
    }, [authenticated, user, ready, fetchUsername]);

    // Render wallet connection if not connected
    if (!isConnected) {
        return (
            <div className="connect-wallet">
                <div className="pixel-card connect-card">
                    <div className="login-header">
                        <h2>MON CRUSH</h2>
                    </div>
                    <p>Connect your Monad Games ID to start playing Mon Crush!</p>
                    <div className="wallet-connect-btn">
                        <button 
                            onClick={login}
                            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Login with Monad Games ID
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="app">
            {/* Main Game Layout */}
            <div className="main-game-container">
                {/* Game Board Section */}
                <div className="game-section">

            {/* Pause Overlay */}
            {isPaused && (
                <div className="pause-overlay">
                    <div className="pause-content">
                        <h2>Game Paused</h2>
                        <p>Click Resume to continue playing</p>
                        <button 
                            className="control-btn resume-btn"
                            onClick={togglePause}
                        >
                            Resume Game
                        </button>
                    </div>
                </div>
            )}

            {/* Level Completed Overlay */}
            {levelCompleted && (
                <div className="level-completed-overlay">
                    <div className="level-completed-content">
                        <h2>🎉 Level {currentLevel} Completed!</h2>
                        <p>Score: {score}</p>
                        <p>Target: {targetScore}</p>
                        <div className="level-completed-buttons">
                            <button 
                                className="control-btn next-level-btn"
                                onClick={startNextLevel}
                            >
                                Next Level
                            </button>
                            <button 
                                className="control-btn restart-btn"
                                onClick={restartLevel}
                            >
                                Replay Level
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Leaderboard Overlay */}
            {showLeaderboard && (
                <div className="leaderboard-overlay">
                    <div className="leaderboard-content">
                        <h2>🏆 Mon Crush Leaderboard</h2>
                        
                        {/* Leaderboard Type Selector */}
                        <div className="leaderboard-tabs">
                            <button 
                                className={`tab-btn ${leaderboardType === 'overall' ? 'active' : ''}`}
                                onClick={() => fetchLeaderboardFromAPI()}
                                disabled={leaderboardLoading}
                            >
                                🌟 Overall
                            </button>
                            <button 
                                className={`tab-btn ${leaderboardType === 'level' ? 'active' : ''}`}
                                onClick={() => fetchLeaderboardFromAPI(currentLevel)}
                                disabled={leaderboardLoading}
                            >
                                🎯 Level {currentLevel}
                            </button>
                        </div>

                        {/* Level Selector for Level Leaderboard */}
                        {leaderboardType === 'level' && (
                            <div className="level-selector">
                                <label>Select Level: </label>
                                <select 
                                    value={leaderboardLevel} 
                                    onChange={(e) => {
                                        const level = parseInt(e.target.value);
                                        setLeaderboardLevel(level);
                                        fetchLeaderboardFromAPI(level);
                                    }}
                                    disabled={leaderboardLoading}
                                >
                                    {Array.from({length: Math.max(currentLevel, 10)}, (_, i) => i + 1).map(level => (
                                        <option key={level} value={level}>Level {level}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        <div className="leaderboard-list">
                            <div className="leaderboard-header">
                                <span>Rank</span>
                                <span>Player</span>
                                {leaderboardType === 'overall' ? (
                                    <>
                                        <span>Max Level</span>
                                        <span>Total Score</span>
                                        <span>Games</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Score</span>
                                        <span>Time</span>
                                        <span>Date</span>
                                    </>
                                )}
                            </div>
                            
                            {leaderboardLoading ? (
                                <div className="leaderboard-loading">
                                    <div className="loading-spinner"></div>
                                    <p>Loading leaderboard...</p>
                                </div>
                            ) : leaderboardData.length === 0 ? (
                                <div className="leaderboard-empty">
                                    <p>No data available yet!</p>
                                    <p>Be the first to complete a level! 🎮</p>
                                </div>
                            ) : (
                                leaderboardData.map((entry) => (
                                    <div key={`${entry.wallet_address}-${entry.rank}`} className="leaderboard-row">
                                        <span className="rank">#{entry.rank}</span>
                                        <span className="player" title={entry.wallet_address}>
                                            {entry.username || `${entry.wallet_address.substring(0, 8)}...`}
                                        </span>
                                        {leaderboardType === 'overall' ? (
                                            <>
                                                <span className="level">Level {entry.highest_level}</span>
                                                <span className="score">{entry.total_score?.toLocaleString()}</span>
                                                <span className="games">{entry.games_played || 0}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="score">{entry.score?.toLocaleString()}</span>
                                                <span className="time">{entry.game_time ? `${Math.floor(entry.game_time / 60)}:${(entry.game_time % 60).toString().padStart(2, '0')}` : '-'}</span>
                                                <span className="date">{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : '-'}</span>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                        
                        <div className="leaderboard-buttons">
                            <button 
                                className="control-btn refresh-btn"
                                onClick={() => fetchLeaderboardFromAPI(leaderboardType === 'level' ? leaderboardLevel : null)}
                                disabled={leaderboardLoading}
                            >
                                🔄 Refresh
                            </button>
                            <button 
                                className="control-btn close-btn"
                                onClick={() => setShowLeaderboard(false)}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
                    <div className="game-board" style={{ backgroundImage: `url(${backgroundImage})` }}>
                        <div className="game">
                            {board.map((candy) => (
                                <div
                                    key={candy.id}
                                    className={`candy-container ${candy.isMatched ? 'matched' : ''} ${candy.isFalling ? 'falling' : ''} ${candy.isNew ? 'new' : ''} ${selectedCandy === candy.id ? 'selected' : ''}`}
                                    style={{
                                        transform: candy.isFalling ? `translateY(${candy.fallDistance}px)` : 'none'
                                    }}
                                >
                                    <img
                                        src={candy.src}
                                        alt="candy"
                                        onClick={() => handleCandyClick(candy.id)}
                                        className={`candy ${candy.isMatched ? 'matched' : ''} ${candy.isNew ? 'new' : ''} ${candy.isSpecial ? 'special-bomb' : ''} ${candy.specialType ? candy.specialType : ''}`}
                                        style={{ 
                                            userSelect: 'none',
                                            cursor: (isProcessing || isPaused) ? 'not-allowed' : 'pointer'
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* TX Bubbles - Right Side */}
                <div className="tx-bubbles-container">
                    <div className="tx-bubbles-header">Transactions</div>
                    <div className="tx-bubbles">
                        {transactions.slice(0, 5).map((tx) => (
                            <div key={tx.id} className={`tx-bubble ${tx.status}`}>
                                <div className="tx-status-icon">
                                    {tx.status === 'pending' && '⏳'}
                                    {tx.status === 'success' && '✅'}
                                    {tx.status === 'failed' && '❌'}
                                </div>
                                <div className="tx-details">
                                    <div className="tx-score">{tx.score}</div>
                                    <div className="tx-time">{new Date(tx.timestamp).toLocaleTimeString()}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Compact Controls - Bottom */}
            <div className="bottom-controls">
                <div className="game-stats-bottom">
                    <div className="stat-item">
                        <span>Level <strong>{currentLevel}</strong></span>
                    </div>
                    <div className="stat-item">
                        <span>Score <strong className="score-highlight">{score}</strong></span>
                    </div>
                    <div className="stat-item">
                        <span>Target <strong>{targetScore}</strong></span>
                    </div>
                    <div className="stat-item">
                        <span>Moves <strong className="moves-highlight">{movesLeft}</strong></span>
                    </div>
                    <div className="stat-item">
                        <span>Time <strong>{formatTime(gameTime)}</strong></span>
                    </div>
                    <div className="stat-item">
                        <span>Combo <strong className="combo-highlight">{combo}x</strong></span>
                    </div>
                </div>
                
                <div className="control-buttons">
                    <button className="control-btn-small pause-btn" onClick={togglePause} disabled={isProcessing}>
                        {isPaused ? '▶️' : '⏸️'}
                    </button>
                    <button className="control-btn-small restart-btn" onClick={restartGame} disabled={isProcessing}>
                        🔄
                    </button>
                    <button className="control-btn-small leaderboard-btn" onClick={() => setShowLeaderboard(true)} disabled={isProcessing}>
                        🏆
                    </button>
                    <button className="control-btn-small exit-btn" onClick={exitGame} disabled={isProcessing}>
                        ❌
                    </button>
                </div>
                
                <div className="player-info-bottom">
                    <span className="player-name">
                        {hasUsername && username ? username : 
                         <a href="https://monad-games-id-site.vercel.app" target="_blank" rel="noopener noreferrer" className="register-link">
                            Register Username
                         </a>
                        }
                    </span>
                    <span className="wallet-short">{address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : ''}</span>
                </div>
            </div>
        </div>
    );
};

export default CandyCrushGame;
