import React, { useState, useEffect } from 'react';

// Import the combat system logic
// Note: In a real implementation, you would import from separate files
// The AI Combat System code from the previous artifact is assumed to be available

const AITypes = {
  Berserker: {
    baseAttack: 15,
    baseDefense: 5,
    baseSpeed: 8,
    energyRegen: 3,
    abilities: [
      {
        name: 'Fury Strike',
        energyCost: 20,
        cooldown: 2,
        power: 25,
        tags: ['melee', 'offensive'],
        execute: (user, target) => {
          const damage = calculateDamage(user.attack * 1.5, target.defense);
          target.health -= damage;
          return { message: `${user.name} unleashes Fury Strike for ${damage.toFixed(1)} damage!`, damage };
        }
      },
      {
        name: 'Rage',
        energyCost: 30,
        cooldown: 10,
        power: 15,
        tags: ['buff', 'defensive'],
        execute: (user) => {
          user.effects.push({
            name: 'Rage',
            duration: 3,
            apply: (ai) => {
              if (!ai.rageApplied) {
                ai.attack += 10;
                ai.rageApplied = true;
              }
            },
            remove: (ai) => {
              ai.attack -= 10;
              ai.rageApplied = false;
            }
          });
          return { message: `${user.name} enters a state of Rage! Attack increased!` };
        }
      }
    ]
  },
  
  Tactician: {
    baseAttack: 8,
    baseDefense: 10,
    baseSpeed: 10,
    energyRegen: 5,
    abilities: [
      {
        name: 'Precision Strike',
        energyCost: 15,
        cooldown: 3,
        power: 20,
        tags: ['ranged', 'offensive'],
        execute: (user, target) => {
          const damage = calculateDamage(user.attack * 2, target.defense / 2);
          target.health -= damage;
          return { message: `${user.name} executes a Precision Strike for ${damage.toFixed(1)} damage!`, damage };
        }
      },
      {
        name: 'Tactical Shield',
        energyCost: 25,
        cooldown: 8,
        power: 10,
        tags: ['buff', 'defensive'],
        execute: (user) => {
          user.effects.push({
            name: 'Tactical Shield',
            duration: 4,
            apply: (ai) => {
              if (!ai.shieldApplied) {
                ai.defense += 15;
                ai.shieldApplied = true;
              }
            },
            remove: (ai) => {
              ai.defense -= 15;
              ai.shieldApplied = false;
            }
          });
          return { message: `${user.name} activates Tactical Shield! Defense increased!` };
        }
      }
    ]
  },
  
  Engineer: {
    baseAttack: 7,
    baseDefense: 8,
    baseSpeed: 7,
    energyRegen: 6,
    abilities: [
      {
        name: 'Deploy Turret',
        energyCost: 40,
        cooldown: 15,
        power: 30,
        tags: ['special', 'ranged'],
        execute: (user, target) => {
          return { message: `${user.name} deploys a combat turret!` };
        }
      },
      {
        name: 'Repair',
        energyCost: 20,
        cooldown: 5,
        power: 15,
        tags: ['healing', 'defensive'],
        execute: (user) => {
          const healing = 15;
          user.health = Math.min(user.health + healing, 100);
          return { message: `${user.name} repairs itself for ${healing} health!`, healing };
        }
      }
    ]
  },
  
  Elemental: {
    baseAttack: 12,
    baseDefense: 6,
    baseSpeed: 9,
    energyRegen: 4,
    abilities: [
      {
        name: 'Flame Burst',
        energyCost: 25,
        cooldown: 4,
        power: 22,
        tags: ['ranged', 'offensive'],
        execute: (user, target) => {
          const damage = calculateDamage(user.attack * 1.7, target.defense);
          target.health -= damage;
          target.effects.push({
            name: 'Burning',
            duration: 3,
            apply: (ai) => {
              ai.health -= 3;
            },
            remove: () => {}
          });
          return { message: `${user.name} casts Flame Burst for ${damage.toFixed(1)} damage! Target is burning!`, damage };
        }
      },
      {
        name: 'Ice Barrier',
        energyCost: 30,
        cooldown: 10,
        power: 18,
        tags: ['buff', 'defensive'],
        execute: (user) => {
          user.effects.push({
            name: 'Ice Barrier',
            duration: 5,
            apply: (ai) => {
              if (!ai.barrierApplied) {
                ai.defense += 12;
                ai.barrierApplied = true;
              }
            },
            remove: (ai) => {
              ai.defense -= 12;
              ai.barrierApplied = false;
            }
          });
          return { message: `${user.name} surrounds itself with an Ice Barrier! Defense increased!` };
        }
      }
    ]
  }
};

// Item definitions
const Items = {
  attackBooster: {
    name: "Attack Amplifier",
    attackBoost: 5,
    description: "Increases attack power by 5 points."
  },
  defenseBooster: {
    name: "Defense Matrix",
    defenseBoost: 7,
    description: "Increases defense by 7 points."
  },
  healthPotion: {
    name: "Repair Nanites",
    healthBoost: 25,
    description: "Restores 25 health points."
  },
  energyCell: {
    name: "Energy Cell",
    energyBoost: 30,
    description: "Restores 30 energy points."
  },
  speedModule: {
    name: "Speed Module",
    speedBoost: 3,
    description: "Increases speed by 3 points."
  },
  specialWeapon: {
    name: "Plasma Cannon",
    attackBoost: 10,
    ability: {
      name: "Plasma Blast",
      energyCost: 35,
      cooldown: 8,
      power: 35,
      tags: ['ranged', 'offensive'],
      execute: (user, target) => {
        const damage = calculateDamage(user.attack * 2.5, target.defense);
        target.health -= damage;
        return { message: `${user.name} fires a devastating Plasma Blast for ${damage.toFixed(1)} damage!`, damage };
      }
    },
    description: "Adds a powerful Plasma Blast ability and increases attack by 10."
  }
};

// Helper function to calculate damage
function calculateDamage(attack, defense) {
  const baseDamage = attack * (1 - (defense / (defense + 50)));
  const variance = baseDamage * 0.2; // 20% variance
  return Math.max(1, baseDamage + (Math.random() * variance - variance/2));
}

// AI Class
class AI {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.health = 100;
    this.energy = 100;
    this.attack = type.baseAttack;
    this.defense = type.baseDefense;
    this.speed = type.baseSpeed;
    this.abilities = [...type.abilities];
    this.items = [];
    this.position = { x: 0, y: 0 };
    this.target = null;
    this.cooldowns = {};
    this.effects = [];
  }

  applyItem(item) {
    this.items.push(item);
    if (item.healthBoost) this.health += item.healthBoost;
    if (item.energyBoost) this.energy += item.energyBoost;
    if (item.attackBoost) this.attack += item.attackBoost;
    if (item.defenseBoost) this.defense += item.defenseBoost;
    if (item.speedBoost) this.speed += item.speedBoost;
    if (item.ability) this.abilities.push(item.ability);
    return `${this.name} equipped ${item.name}!`;
  }

  useAbility(abilityName, target) {
    const ability = this.abilities.find(a => a.name === abilityName);
    if (!ability) return { success: false, message: `Ability ${abilityName} not found.` };
    
    if (this.cooldowns[abilityName] > 0) {
      return { success: false, message: `${abilityName} is on cooldown for ${this.cooldowns[abilityName]} more seconds.` };
    }
    
    if (this.energy < ability.energyCost) {
      return { success: false, message: `Not enough energy to use ${abilityName}.` };
    }
    
    this.energy -= ability.energyCost;
    this.cooldowns[abilityName] = ability.cooldown;
    
    const result = ability.execute(this, target);
    return { success: true, ...result };
  }

  updateEffects() {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.duration--;
      effect.apply(this);
      
      if (effect.duration <= 0) {
        effect.remove(this);
        this.effects.splice(i, 1);
      }
    }
  }

  updateCooldowns() {
    for (const ability in this.cooldowns) {
      if (this.cooldowns[ability] > 0) {
        this.cooldowns[ability]--;
      }
    }
  }

  regenerate() {
    this.energy = Math.min(this.energy + this.type.energyRegen, 100);
  }
  
  decideAction(opponent) {
    // AI decision-making logic
    const availableAbilities = this.abilities.filter(ability => 
      !this.cooldowns[ability.name] && this.energy >= ability.energyCost
    );
    
    if (availableAbilities.length === 0) {
      return { type: 'move', direction: { x: 0, y: 0 } };
    }
    
    // Simple decision tree based on situation
    if (this.health < 30 && availableAbilities.some(a => a.tags.includes('defensive'))) {
      const defensiveAbility = availableAbilities.find(a => a.tags.includes('defensive'));
      return { type: 'ability', ability: defensiveAbility.name, target: opponent };
    }
    
    if (this.position && opponent.position && Math.abs(this.position.x - opponent.position.x) < 2 && Math.abs(this.position.y - opponent.position.y) < 2) {
      const meleeAbility = availableAbilities.find(a => a.tags.includes('melee'));
      if (meleeAbility) {
        return { type: 'ability', ability: meleeAbility.name, target: opponent };
      }
    } else {
      const rangedAbility = availableAbilities.find(a => a.tags.includes('ranged'));
      if (rangedAbility) {
        return { type: 'ability', ability: rangedAbility.name, target: opponent };
      }
    }
    
    // Default to using the most powerful available ability
    const mostPowerful = availableAbilities.sort((a, b) => b.power - a.power)[0];
    return { type: 'ability', ability: mostPowerful.name, target: opponent };
  }
}

// Main Combat App Component
const AICombatApp = () => {
  // Game state
  const [gameState, setGameState] = useState('setup'); // setup, selecting, round, powerup, gameOver
  const [player1Type, setPlayer1Type] = useState('');
  const [player2Type, setPlayer2Type] = useState('');
  const [player1AI, setPlayer1AI] = useState(null);
  const [player2AI, setPlayer2AI] = useState(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [roundTime, setRoundTime] = useState(30);
  const [battleLog, setBattleLog] = useState([]);
  const [winner, setWinner] = useState(null);
  const [player1Item, setPlayer1Item] = useState('');
  const [player2Item, setPlayer2Item] = useState('');
  const [battlefieldSize] = useState({ width: 10, height: 6 });
  const [obstacles] = useState([
    { x: 3, y: 1 }, 
    { x: 6, y: 4 }, 
    { x: 5, y: 2 },
    { x: 4, y: 4 }
  ]);

  // Initialize the game
  const initializeGame = () => {
    if (!player1Type || !player2Type) {
      alert('Please select AI types for both players!');
      return;
    }
    
    const ai1 = new AI(`Player 1's ${player1Type}`, AITypes[player1Type]);
    const ai2 = new AI(`Player 2's ${player2Type}`, AITypes[player2Type]);
    
    // Set starting positions
    ai1.position = { x: 1, y: Math.floor(battlefieldSize.height / 2) };
    ai2.position = { x: battlefieldSize.width - 2, y: Math.floor(battlefieldSize.height / 2) };
    
    setPlayer1AI(ai1);
    setPlayer2AI(ai2);
    setRoundNumber(0);
    setBattleLog([]);
    setWinner(null);
    setGameState('selecting');
  };

  // Start a new round
  const startRound = () => {
    setRoundNumber(prev => prev + 1);
    setRoundTime(30);
    setBattleLog(prev => [...prev, `=== ROUND ${roundNumber + 1} START ===`]);
    setGameState('round');
  };

  // Process combat tick
  const processTick = () => {
    if (!player1AI || !player2AI) return;
    
    // Update status effects and cooldowns
    player1AI.updateEffects();
    player1AI.updateCooldowns();
    player1AI.regenerate();
    
    player2AI.updateEffects();
    player2AI.updateCooldowns();
    player2AI.regenerate();
    
    // AI 1's turn
    const action1 = player1AI.decideAction(player2AI);
    const result1 = executeAction(player1AI, action1, player2AI);
    if (result1) {
      setBattleLog(prev => [...prev, result1]);
    }
    
    // Check if AI 2 is defeated
    if (player2AI.health <= 0) {
      setWinner(player1AI);
      setGameState('gameOver');
      setBattleLog(prev => [...prev, `${player2AI.name} has been defeated!`]);
      return;
    }
    
    // AI 2's turn
    const action2 = player2AI.decideAction(player1AI);
    const result2 = executeAction(player2AI, action2, player1AI);
    if (result2) {
      setBattleLog(prev => [...prev, result2]);
    }
    
    // Check if AI 1 is defeated
    if (player1AI.health <= 0) {
      setWinner(player2AI);
      setGameState('gameOver');
      setBattleLog(prev => [...prev, `${player1AI.name} has been defeated!`]);
      return;
    }
    
    // Update AIs
    setPlayer1AI({...player1AI});
    setPlayer2AI({...player2AI});
  };

  // Execute AI action
  const executeAction = (ai, action, opponent) => {
    if (action.type === 'ability') {
      const result = ai.useAbility(action.ability, opponent);
      return result.message;
    } else if (action.type === 'move') {
      // In UI version, we simplify movement
      return `${ai.name} repositions.`;
    }
    return null;
  };

  // Apply power-up to AI
  const applyPowerup = (player, itemKey) => {
    const item = Items[itemKey];
    if (!item) return false;
    
    let message = '';
    if (player === 1 && player1AI) {
      message = player1AI.applyItem(item);
      setPlayer1AI({...player1AI});
    } else if (player === 2 && player2AI) {
      message = player2AI.applyItem(item);
      setPlayer2AI({...player2AI});
    }
    
    setBattleLog(prev => [...prev, message]);
    return true;
  };

  // End current round
  const endRound = () => {
    setBattleLog(prev => [...prev, `=== ROUND ${roundNumber} END ===`]);
    
    if (winner) {
      setBattleLog(prev => [...prev, `GAME OVER! ${winner.name} is victorious!`]);
    } else {
      setBattleLog(prev => [...prev, "Time for power-ups!"]);
      setGameState('powerup');
    }
  };

  // Apply selected power-ups and continue
  const confirmPowerups = () => {
    if (player1Item) {
      applyPowerup(1, player1Item);
      setPlayer1Item('');
    }
    
    if (player2Item) {
      applyPowerup(2, player2Item);
      setPlayer2Item('');
    }
    
    setGameState('selecting');
  };

  // Reset game
  const resetGame = () => {
    setGameState('setup');
    setPlayer1Type('');
    setPlayer2Type('');
    setPlayer1AI(null);
    setPlayer2AI(null);
    setRoundNumber(0);
    setBattleLog([]);
    setWinner(null);
  };

  // Round timer effect
  useEffect(() => {
    let timer;
    if (gameState === 'round' && roundTime > 0) {
      timer = setTimeout(() => {
        setRoundTime(prev => prev - 1);
        processTick();
      }, 1000);
    } else if (gameState === 'round' && roundTime <= 0) {
      endRound();
    }
    
    return () => clearTimeout(timer);
  }, [gameState, roundTime]);

  return (
    <div className="flex flex-col w-full max-w-6xl mx-auto p-4 min-h-screen bg-gray-100">
      <h1 className="text-3xl font-bold text-center mb-4">AI Combat System</h1>
      
      {gameState === 'setup' && (
        <div className="bg-white rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4">Select AI Types</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2">Player 1</h3>
              <select 
                className="w-full p-2 border rounded mb-4"
                value={player1Type} 
                onChange={e => setPlayer1Type(e.target.value)}
              >
                <option value="">Select AI Type</option>
                {Object.keys(AITypes).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              
              {player1Type && (
                <div className="bg-gray-100 p-3 rounded">
                  <h4 className="font-medium">{player1Type} Stats:</h4>
                  <p>Attack: {AITypes[player1Type].baseAttack}</p>
                  <p>Defense: {AITypes[player1Type].baseDefense}</p>
                  <p>Speed: {AITypes[player1Type].baseSpeed}</p>
                  <h4 className="font-medium mt-2">Abilities:</h4>
                  <ul className="list-disc ml-5">
                    {AITypes[player1Type].abilities.map(ability => (
                      <li key={ability.name}>{ability.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Player 2</h3>
              <select 
                className="w-full p-2 border rounded mb-4"
                value={player2Type} 
                onChange={e => setPlayer2Type(e.target.value)}
              >
                <option value="">Select AI Type</option>
                {Object.keys(AITypes).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              
              {player2Type && (
                <div className="bg-gray-100 p-3 rounded">
                  <h4 className="font-medium">{player2Type} Stats:</h4>
                  <p>Attack: {AITypes[player2Type].baseAttack}</p>
                  <p>Defense: {AITypes[player2Type].baseDefense}</p>
                  <p>Speed: {AITypes[player2Type].baseSpeed}</p>
                  <h4 className="font-medium mt-2">Abilities:</h4>
                  <ul className="list-disc ml-5">
                    {AITypes[player2Type].abilities.map(ability => (
                      <li key={ability.name}>{ability.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          
          <button 
            className="w-full mt-6 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
            onClick={initializeGame}
          >
            Start Game
          </button>
        </div>
      )}
      
      {gameState !== 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Player 1 Stats */}
          <div className="bg-white rounded-lg p-4 shadow-md">
            <h2 className="text-xl font-semibold mb-2 text-blue-600">
              {player1AI && player1AI.name}
            </h2>
            
            {player1AI && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span>Health:</span>
                  <div className="w-32 bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-red-600 h-4 rounded-full" 
                      style={{width: `${Math.max(0, player1AI.health)}%`}}
                    ></div>
                  </div>
                  <span>{Math.max(0, player1AI.health.toFixed(1))}</span>
                </div>
                
                <div className="flex justify-between items-center mb-2">
                  <span>Energy:</span>
                  <div className="w-32 bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-blue-600 h-4 rounded-full" 
                      style={{width: `${player1AI.energy}%`}}
                    ></div>
                  </div>
                  <span>{player1AI.energy.toFixed(1)}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>Attack: {player1AI.attack}</div>
                  <div>Defense: {player1AI.defense}</div>
                  <div>Speed: {player1AI.speed}</div>
                </div>
                
                <h3 className="font-medium mt-3">Abilities:</h3>
                <div className="space-y-2 mt-1">
                  {player1AI.abilities.map(ability => (
                    <div key={ability.name} className="flex justify-between">
                      <span>{ability.name}</span>
                      <span className="text-sm text-gray-600">
                        {player1AI.cooldowns[ability.name] > 0 ? 
                          `CD: ${player1AI.cooldowns[ability.name]}s` : 
                          `Ready`}
                      </span>
                    </div>
                  ))}
                </div>
                
                {player1AI.items.length > 0 && (
                  <>
                    <h3 className="font-medium mt-3">Items:</h3>
                    <ul className="list-disc ml-5">
                      {player1AI.items.map((item, idx) => (
                        <li key={idx}>{item.name}</li>
                      ))}
                    </ul>
                  </>
                )}
                
                {player1AI.effects.length > 0 && (
                  <>
                    <h3 className="font-medium mt-3">Effects:</h3>
                    <div className="flex flex-wrap gap-2">
                      {player1AI.effects.map((effect, idx) => (
                        <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">
                          {effect.name} ({effect.duration}s)
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Middle Column - Battlefield */}
          <div className="bg-white rounded-lg p-4 shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {roundNumber > 0 ? `Round ${roundNumber}` : 'Ready to Fight'}
              </h2>
              
              {gameState === 'round' && (
                <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">
                  {roundTime}s
                </div>
              )}
            </div>
            
            {/* Battlefield Grid */}
            <div 
              className="grid grid-cols-10 gap-1 mb-4" 
              style={{
                height: '300px',
                gridTemplateRows: `repeat(${battlefieldSize.height}, 1fr)`
              }}
            >
              {[...Array(battlefieldSize.height)].map((_, y) => (
                [...Array(battlefieldSize.width)].map((_, x) => {
                  const isPlayer1 = player1AI && player1AI.position.x === x && player1AI.position.y === y;
                  const isPlayer2 = player2AI && player2AI.position.x === x && player2AI.position.y === y;
                  const isObstacle = obstacles.some(obs => obs.x === x && obs.y === y);
                  
                  return (
                    <div 
                      key={`${x}-${y}`}
                      className={`
                        border 
                        ${isObstacle ? 'bg-gray-500' : 'bg-gray-100'} 
                        ${isPlayer1 ? 'bg-blue-500' : ''} 
                        ${isPlayer2 ? 'bg-red-500' : ''}
                        flex items-center justify-center
                      `}
                    >
                      {isPlayer1 && <div className="w-4 h-4 bg-blue-600 rounded-full"></div>}
                      {isPlayer2 && <div className="w-4 h-4 bg-red-600 rounded-full"></div>}
                    </div>
                  );
                })
              ))}
            </div>
            
            {/* Battle Log */}
            <div className="mt-4">
              <h3 className="font-medium mb-1">Battle Log:</h3>
              <div className="bg-gray-100 rounded p-2 h-32 overflow-y-auto text-sm">
                {battleLog.map((log, idx) => (
                  <div key={idx} className="mb-1">
                    {log}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Controls */}
            <div className="mt-4 flex justify-center">
              {gameState === 'selecting' && (
                <button 
                  className="bg-green-600 text-white py-2 px-6 rounded hover:bg-green-700"
                  onClick={startRound}
                >
                  Start Round {roundNumber + 1}
                </button>
              )}
              
              {gameState === 'gameOver' && (
                <button 
                  className="bg-blue-600 text-white py-2 px-6 rounded hover:bg-blue-700"
                  onClick={resetGame}
                >
                  New Game
                </button>
              )}
            </div>
          </div>
          
          {/* Right Column - Player 2 Stats */}
          <div className="bg-white rounded-lg p-4 shadow-md">
            <h2 className="text-xl font-semibold mb-2 text-red-600">
              {player2AI && player2AI.name}
            </h2>
            
            {player2AI && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span>Health:</span>
                  <div className="w-32 bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-red-600 h-4 rounded-full" 
                      style={{width: `${Math.max(0, player2AI.health)}%`}}
                    ></div>
                  </div>
                  <span>{Math.max(0, player2AI.health.toFixed(1))}</span>
                </div>
                
                <div className="flex justify-between items-center mb-2">
                  <span>Energy:</span>
                  <div className="w-32 bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-blue-600 h-4 rounded-full" 
                      style={{width: `${player2AI.energy}%`}}
                    ></div>
                  