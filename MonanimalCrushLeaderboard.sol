// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title MonanimalCrushLeaderboard
 * @dev MonanimalCrush oyunu için leaderboard sistemi
 * @author Monad Games
 */
contract MonanimalCrushLeaderboard is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    // Structs
    struct LeaderboardEntry {
        address player;
        uint256 level;
        uint256 score;
        uint256 timestamp;
        bool exists;
    }

    struct PlayerStats {
        uint256 highestLevel;
        uint256 totalScore;
        uint256 totalLevelsCompleted;
        uint256 lastPlayed;
    }

    // Events
    event LevelCompleted(
        address indexed player,
        uint256 indexed level,
        uint256 score,
        uint256 timestamp
    );

    event PlayerRegistered(address indexed player, uint256 timestamp);
    event LeaderboardCleared(uint256 timestamp);

    // State variables
    Counters.Counter private _entryIdCounter;
    
    // Mapping from entry ID to leaderboard entry
    mapping(uint256 => LeaderboardEntry) public leaderboardEntries;
    
    // Mapping from player address to their stats
    mapping(address => PlayerStats) public playerStats;
    
    // Array of all entry IDs for easy iteration
    uint256[] public allEntryIds;
    
    // Game settings
    uint256 public maxEntries = 1000; // Maximum number of entries to keep
    uint256 public minScoreToRecord = 10; // Minimum score to record on leaderboard
    
    // Modifiers
    modifier validLevel(uint256 _level) {
        require(_level > 0 && _level <= 1000, "Invalid level");
        _;
    }

    modifier validScore(uint256 _score) {
        require(_score >= minScoreToRecord, "Score too low");
        _;
    }

    /**
     * @dev Constructor
     */
    constructor() {
        _entryIdCounter.increment(); // Start from 1
    }

    /**
     * @dev Submit a level completion to the leaderboard
     * @param _level The level completed
     * @param _score The score achieved
     */
    function submitLevelCompletion(uint256 _level, uint256 _score) 
        external 
        validLevel(_level) 
        validScore(_score) 
        nonReentrant 
    {
        address player = msg.sender;
        
        // Create new leaderboard entry
        uint256 entryId = _entryIdCounter.current();
        _entryIdCounter.increment();
        
        LeaderboardEntry memory newEntry = LeaderboardEntry({
            player: player,
            level: _level,
            score: _score,
            timestamp: block.timestamp,
            exists: true
        });
        
        leaderboardEntries[entryId] = newEntry;
        allEntryIds.push(entryId);
        
        // Update player stats
        PlayerStats storage stats = playerStats[player];
        if (stats.highestLevel < _level) {
            stats.highestLevel = _level;
        }
        stats.totalScore += _score;
        stats.totalLevelsCompleted++;
        stats.lastPlayed = block.timestamp;
        
        // Clean up old entries if we exceed maxEntries
        if (allEntryIds.length > maxEntries) {
            _cleanupOldEntries();
        }
        
        emit LevelCompleted(player, _level, _score, block.timestamp);
    }

    /**
     * @dev Get leaderboard entries with pagination
     * @param _startIndex Starting index
     * @param _count Number of entries to return
     * @return entries Array of leaderboard entries
     * @return totalCount Total number of entries
     */
    function getLeaderboardEntries(uint256 _startIndex, uint256 _count) 
        external 
        view 
        returns (LeaderboardEntry[] memory entries, uint256 totalCount) 
    {
        totalCount = allEntryIds.length;
        
        if (_startIndex >= totalCount) {
            return (new LeaderboardEntry[](0), totalCount);
        }
        
        uint256 endIndex = _startIndex + _count;
        if (endIndex > totalCount) {
            endIndex = totalCount;
        }
        
        uint256 resultCount = endIndex - _startIndex;
        entries = new LeaderboardEntry[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            uint256 entryId = allEntryIds[_startIndex + i];
            entries[i] = leaderboardEntries[entryId];
        }
    }

    /**
     * @dev Get top players by level
     * @param _count Number of top players to return
     * @return entries Array of top leaderboard entries
     */
    function getTopPlayersByLevel(uint256 _count) 
        external 
        view 
        returns (LeaderboardEntry[] memory entries) 
    {
        uint256 totalCount = allEntryIds.length;
        if (totalCount == 0) {
            return new LeaderboardEntry[](0);
        }
        
        if (_count > totalCount) {
            _count = totalCount;
        }
        
        entries = new LeaderboardEntry[](_count);
        
        // Create a temporary array for sorting
        uint256[] memory tempEntryIds = new uint256[](totalCount);
        for (uint256 i = 0; i < totalCount; i++) {
            tempEntryIds[i] = allEntryIds[i];
        }
        
        // Sort by level (descending) and then by score (descending)
        for (uint256 i = 0; i < _count; i++) {
            uint256 maxIndex = i;
            for (uint256 j = i + 1; j < totalCount; j++) {
                LeaderboardEntry memory current = leaderboardEntries[tempEntryIds[j]];
                LeaderboardEntry memory max = leaderboardEntries[tempEntryIds[maxIndex]];
                
                if (current.level > max.level || 
                    (current.level == max.level && current.score > max.score)) {
                    maxIndex = j;
                }
            }
            
            // Swap
            if (maxIndex != i) {
                uint256 temp = tempEntryIds[i];
                tempEntryIds[i] = tempEntryIds[maxIndex];
                tempEntryIds[maxIndex] = temp;
            }
            
            entries[i] = leaderboardEntries[tempEntryIds[i]];
        }
    }

    /**
     * @dev Get player's leaderboard entries
     * @param _player Player address
     * @param _startIndex Starting index
     * @param _count Number of entries to return
     * @return entries Array of player's leaderboard entries
     * @return totalCount Total number of player's entries
     */
    function getPlayerEntries(address _player, uint256 _startIndex, uint256 _count) 
        external 
        view 
        returns (LeaderboardEntry[] memory entries, uint256 totalCount) 
    {
        // Count total entries for this player
        totalCount = 0;
        for (uint256 i = 0; i < allEntryIds.length; i++) {
            if (leaderboardEntries[allEntryIds[i]].player == _player) {
                totalCount++;
            }
        }
        
        if (_startIndex >= totalCount) {
            return (new LeaderboardEntry[](0), totalCount);
        }
        
        uint256 endIndex = _startIndex + _count;
        if (endIndex > totalCount) {
            endIndex = totalCount;
        }
        
        uint256 resultCount = endIndex - _startIndex;
        entries = new LeaderboardEntry[](resultCount);
        
        uint256 foundCount = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < allEntryIds.length && foundCount < endIndex; i++) {
            LeaderboardEntry memory entry = leaderboardEntries[allEntryIds[i]];
            if (entry.player == _player) {
                if (foundCount >= _startIndex) {
                    entries[resultIndex] = entry;
                    resultIndex++;
                }
                foundCount++;
            }
        }
    }

    /**
     * @dev Get player statistics
     * @param _player Player address
     * @return stats Player statistics
     */
    function getPlayerStats(address _player) 
        external 
        view 
        returns (PlayerStats memory stats) 
    {
        return playerStats[_player];
    }

    /**
     * @dev Get contract statistics
     * @return totalEntries Total number of entries
     * @return totalPlayers Total number of unique players
     * @return highestLevel Highest level achieved by any player
     * @return highestScore Highest score achieved by any player
     */
    function getContractStats() 
        external 
        view 
        returns (
            uint256 totalEntries,
            uint256 totalPlayers,
            uint256 highestLevel,
            uint256 highestScore
        ) 
    {
        totalEntries = allEntryIds.length;
        
        // Count unique players and find highest stats
        address[] memory uniquePlayers = new address[](totalEntries);
        uint256 uniquePlayerCount = 0;
        
        for (uint256 i = 0; i < totalEntries; i++) {
            address player = leaderboardEntries[allEntryIds[i]].player;
            bool isNewPlayer = true;
            
            for (uint256 j = 0; j < uniquePlayerCount; j++) {
                if (uniquePlayers[j] == player) {
                    isNewPlayer = false;
                    break;
                }
            }
            
            if (isNewPlayer) {
                uniquePlayers[uniquePlayerCount] = player;
                uniquePlayerCount++;
            }
            
            LeaderboardEntry memory entry = leaderboardEntries[allEntryIds[i]];
            if (entry.level > highestLevel) {
                highestLevel = entry.level;
            }
            if (entry.score > highestScore) {
                highestScore = entry.score;
            }
        }
        
        totalPlayers = uniquePlayerCount;
    }

    /**
     * @dev Clean up old entries when we exceed maxEntries
     */
    function _cleanupOldEntries() internal {
        uint256 entriesToRemove = allEntryIds.length - maxEntries;
        
        for (uint256 i = 0; i < entriesToRemove; i++) {
            uint256 entryId = allEntryIds[i];
            delete leaderboardEntries[entryId];
        }
        
        // Remove from array (keep only the newest entries)
        for (uint256 i = 0; i < entriesToRemove; i++) {
            for (uint256 j = 0; j < allEntryIds.length - 1; j++) {
                allEntryIds[j] = allEntryIds[j + 1];
            }
            allEntryIds.pop();
        }
    }

    // Admin functions
    /**
     * @dev Set maximum number of entries to keep
     * @param _maxEntries New maximum
     */
    function setMaxEntries(uint256 _maxEntries) external onlyOwner {
        require(_maxEntries > 0, "Max entries must be greater than 0");
        maxEntries = _maxEntries;
    }

    /**
     * @dev Set minimum score to record on leaderboard
     * @param _minScore New minimum score
     */
    function setMinScoreToRecord(uint256 _minScore) external onlyOwner {
        minScoreToRecord = _minScore;
    }

    /**
     * @dev Clear all leaderboard entries (emergency only)
     */
    function clearLeaderboard() external onlyOwner {
        for (uint256 i = 0; i < allEntryIds.length; i++) {
            delete leaderboardEntries[allEntryIds[i]];
        }
        delete allEntryIds;
        _entryIdCounter.reset();
        _entryIdCounter.increment();
        
        emit LeaderboardCleared(block.timestamp);
    }

    /**
     * @dev Withdraw any ETH sent to the contract
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH withdrawal failed");
    }

    /**
     * @dev Emergency function to recover stuck tokens
     * @param _token Token address
     * @param _amount Amount to recover
     */
    function emergencyRecoverTokens(address _token, uint256 _amount) external onlyOwner {
        // This would require IERC20 interface
        // IERC20(_token).transfer(owner(), _amount);
    }
}
