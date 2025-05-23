// Utility functions for the quiz app
const Utils = {
    // Shuffle array using Fisher-Yates algorithm
    shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },
    
    // Check if two arrays are equal
    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    },
    
    // Calculate Microsoft-style scaled score
    calculateScaledScore(rawPercentage) {
        if (rawPercentage === 0) {
            return 0;
        } else if (rawPercentage === 100) {
            return 1000;
        } else {
            // Non-linear scaling to match Microsoft's approach
            // Passing at ~65-70% raw score maps to 700 scaled
            const passingThreshold = 0.65;
            if (rawPercentage / 100 < passingThreshold) {
                // Below passing: scale 0-699
                return Math.round((rawPercentage / 100 / passingThreshold) * 699);
            } else {
                // Above passing: scale 700-1000
                const abovePassingRatio = (rawPercentage / 100 - passingThreshold) / (1 - passingThreshold);
                return Math.round(700 + (abovePassingRatio * 300));
            }
        }
    },
    
    // Format time duration
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    },
    
    // Generate unique ID
    generateId() {
        return 'q' + Date.now() + Math.random().toString(36).substr(2, 9);
    },
    
    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },
    
    // Deep clone object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
    
    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Get random elements from array
    getRandomElements(array, count) {
        const shuffled = this.shuffle(array);
        return shuffled.slice(0, count);
    },
    
    // Calculate retention based on time passed
    calculateRetention(lastAttempt, retentionScore) {
        if (!lastAttempt) return retentionScore;
        
        const daysPassed = (new Date() - new Date(lastAttempt)) / (1000 * 60 * 60 * 24);
        
        // Forgetting curve: lose ~20% retention per week without practice
        const weeksPassed = daysPassed / 7;
        const retentionLoss = weeksPassed * 20;
        
        return Math.max(0, retentionScore - retentionLoss);
    },
    
    // Parse CSV data (for importing questions)
    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = lines[i].split(',');
            const row = {};
            
            headers.forEach((header, index) => {
                row[header] = values[index] ? values[index].trim() : '';
            });
            
            data.push(row);
        }
        
        return data;
    },
    
    // Export data as JSON
    exportAsJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    // Import JSON file
    importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },
    
    // Validate question format
    validateQuestion(question) {
        const required = ['id', 'text', 'options', 'correctAnswers', 'category'];
        const missing = required.filter(field => !question[field]);
        
        if (missing.length > 0) {
            return { valid: false, errors: `Missing fields: ${missing.join(', ')}` };
        }
        
        if (!Array.isArray(question.options) || question.options.length < 2) {
            return { valid: false, errors: 'Question must have at least 2 options' };
        }
        
        if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) {
            return { valid: false, errors: 'Question must have at least one correct answer' };
        }
        
        // Validate option format
        for (const option of question.options) {
            if (!option.letter || !option.text) {
                return { valid: false, errors: 'Each option must have a letter and text' };
            }
        }
        
        // Validate correct answers exist in options
        const optionLetters = question.options.map(o => o.letter);
        for (const answer of question.correctAnswers) {
            if (!optionLetters.includes(answer)) {
                return { valid: false, errors: `Correct answer ${answer} not found in options` };
            }
        }
        
        return { valid: true };
    },
    
    // Format question for display
    formatQuestion(question) {
        return {
            ...question,
            text: this.escapeHtml(question.text),
            options: question.options.map(opt => ({
                ...opt,
                text: this.escapeHtml(opt.text)
            }))
        };
    },
    
    // Calculate question difficulty based on user performance
    calculateDifficulty(questionId, history) {
        const questionHistory = history[questionId];
        if (!questionHistory || questionHistory.attempts === 0) {
            return 'unknown';
        }
        
        const successRate = questionHistory.correct / questionHistory.attempts;
        
        if (successRate >= 0.8) return 'easy';
        if (successRate >= 0.5) return 'medium';
        return 'hard';
    },
    
    // Get color for difficulty level
    getDifficultyColor(difficulty) {
        const colors = {
            easy: '#34a853',
            medium: '#fbbc04',
            hard: '#ea4335',
            unknown: '#5f6368'
        };
        return colors[difficulty] || colors.unknown;
    }
