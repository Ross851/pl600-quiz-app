// Main Quiz Application Class
class QuizApp {
    constructor() {
        this.allQuestions = [];
        this.questions = [];
        this.currentIndex = 0;
        this.userAnswers = {};
        this.score = 0;
        this.quizMode = 'practice';
        this.showAnswer = false;
        this.showHints = false;
        this.hintLevel = 'easy';
        this.quizStarted = false;
        this.selectedCategories = new Set();
        this.questionCount = 10;
        this.questionHistory = this.loadHistory();
        this.quizResults = [];
        this.testStartTime = null;
        this.init();
    }
    
    async init() {
        await this.loadQuestions();
        this.render();
    }
    
    async loadQuestions() {
        try {
            // Try to load from external JSON file first
            const response = await fetch('data/questions.json');
            if (response.ok) {
                const data = await response.json();
                this.allQuestions = data;
                console.log(`Loaded ${data.length} questions from JSON file`);
            } else {
                throw new Error('Failed to load questions file');
            }
        } catch (error) {
            console.log('Loading embedded questions');
            // Fallback to embedded questions from questions.js
            this.allQuestions = window.questionBank || [];
        }
        
        // Validate questions
        this.validateQuestions();
    }
    
    validateQuestions() {
        this.allQuestions = this.allQuestions.filter(q => {
            const isValid = q.id && q.text && q.options && q.correctAnswers;
            if (!isValid) {
                console.warn('Invalid question detected:', q);
            }
            return isValid;
        });
    }
    
    getOfficialCategories() {
        return [
            'Perform solution envisioning and requirement analysis',
            'Architect a solution',
            'Implement the solution'
        ];
    }
    
    getCategoryWeight(category) {
        const weights = {
            'Perform solution envisioning and requirement analysis': '45-50%',
            'Architect a solution': '35-40%',
            'Implement the solution': '15-20%'
        };
        return weights[category] || 'N/A';
    }
    
    loadHistory() {
        try {
            const saved = localStorage.getItem('pl600_questionHistory');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn('localStorage not available, using in-memory storage');
            return {};
        }
    }
    
    saveHistory() {
        try {
            localStorage.setItem('pl600_questionHistory', JSON.stringify(this.questionHistory));
        } catch (e) {
            console.warn('Unable to save to localStorage');
        }
    }
    
    updateQuestionHistory(questionId, isCorrect) {
        const history = this.questionHistory[questionId] || {
            attempts: 0,
            correct: 0,
            incorrect: 0,
            lastAttempt: null,
            firstSeen: new Date().toISOString(),
            mastered: false,
            retentionScore: 100
        };
        
        history.attempts++;
        history.lastAttempt = new Date().toISOString();
        
        if (isCorrect) {
            history.correct++;
            // Consider mastered after 3 correct attempts with no incorrect
            if (history.correct >= 3 && history.incorrect === 0) {
                history.mastered = true;
            }
            history.retentionScore = Math.min(100, history.retentionScore + 10);
        } else {
            history.incorrect++;
            history.mastered = false;
            history.retentionScore = Math.max(0, history.retentionScore - 20);
        }
        
        this.questionHistory[questionId] = history;
        this.saveHistory();
    }
    
    getQuestionMasteryStatus(questionId) {
        const history = this.questionHistory[questionId];
        
        if (!history) {
            return { status: 'unseen', label: 'New', color: '#5f6368' };
        }
        
        if (history.mastered && history.retentionScore >= 70) {
            return { status: 'mastered', label: 'Mastered', color: '#34a853' };
        }
        
        if (history.incorrect > history.correct || history.retentionScore < 50) {
            return { status: 'weak', label: 'Needs Practice', color: '#ea4335' };
        }
        
        return { status: 'learning', label: 'Learning', color: '#fbbc04' };
    }
    
    calculateMasteryStats() {
        let mastered = 0;
        let weak = 0;
        let unseen = 0;
        let learning = 0;
        
        this.allQuestions.forEach(q => {
            const status = this.getQuestionMasteryStatus(q.id);
            switch (status.status) {
                case 'mastered': mastered++; break;
                case 'weak': weak++; break;
                case 'unseen': unseen++; break;
                case 'learning': learning++; break;
            }
        });
        
        return { 
            mastered, 
            weak, 
            unseen, 
            learning,
            total: this.allQuestions.length 
        };
    }
    
    toggleCategory(category) {
        if (this.selectedCategories.has(category)) {
            this.selectedCategories.delete(category);
        } else {
            this.selectedCategories.add(category);
        }
        this.render();
    }
    
    selectTestQuestions(availableQuestions, targetTotal) {
        // PL-600 exam weight distribution
        const categoryDistribution = {
            'Perform solution envisioning and requirement analysis': {
                min: 0.45,
                max: 0.50,
                questions: []
            },
            'Architect a solution': {
                min: 0.35,
                max: 0.40,
                questions: []
            },
            'Implement the solution': {
                min: 0.15,
                max: 0.20,
                questions: []
            }
        };
        
        // Group questions by category
        availableQuestions.forEach(q => {
            const category = q.category;
            if (categoryDistribution[category]) {
                categoryDistribution[category].questions.push(q);
            }
        });
        
        // Calculate questions per category
        const selectedQuestions = [];
        Object.entries(categoryDistribution).forEach(([category, data]) => {
            const avgPercentage = (data.min + data.max) / 2;
            const targetCount = Math.round(targetTotal * avgPercentage);
            const shuffled = Utils.shuffle(data.questions);
            const selected = shuffled.slice(0, Math.min(targetCount, shuffled.length));
            selectedQuestions.push(...selected);
        });
        
        // Ensure we have exactly the target number
        if (selectedQuestions.length < targetTotal) {
            const remaining = targetTotal - selectedQuestions.length;
            const unused = availableQuestions.filter(q => !selectedQuestions.includes(q));
            const additional = Utils.shuffle(unused).slice(0, remaining);
            selectedQuestions.push(...additional);
        }
        
        return Utils.shuffle(selectedQuestions).slice(0, targetTotal);
    }
    
    startQuiz() {
        let filteredQuestions = [...this.allQuestions];
        
        // Filter by category
        if (this.selectedCategories.size > 0) {
            filteredQuestions = filteredQuestions.filter(q => 
                this.selectedCategories.has(q.category)
            );
        }
        
        if (filteredQuestions.length === 0) {
            alert('No questions available with selected filters');
            return;
        }
        
        // For test mode, use proper exam distribution
        if (this.quizMode === 'test') {
            // PL-600 has 40-60 questions
            const questionCount = Math.floor(Math.random() * 21) + 40; // 40-60 questions
            filteredQuestions = this.selectTestQuestions(filteredQuestions, questionCount);
        } else {
            // Practice mode: shuffle and limit questions
            filteredQuestions = Utils.shuffle(filteredQuestions);
            if (this.questionCount !== 'all') {
                filteredQuestions = filteredQuestions.slice(0, this.questionCount);
            }
        }
        
        this.questions = filteredQuestions;
        this.quizStarted = true;
        this.currentIndex = 0;
        this.score = 0;
        this.userAnswers = {};
        this.quizResults = [];
        this.showAnswer = false;
        this.showHints = false;
        this.testStartTime = new Date();
        this.render();
    }
    
    selectAnswer(optionLetter) {
        if (this.showAnswer) return;
        
        const question = this.questions[this.currentIndex];
        const qId = question.id;
        
        if (question.isMultipleChoice) {
            const currentAnswers = this.userAnswers[qId] || [];
            if (currentAnswers.includes(optionLetter)) {
                this.userAnswers[qId] = currentAnswers.filter(a => a !== optionLetter);
            } else {
                this.userAnswers[qId] = [...currentAnswers, optionLetter];
            }
        } else {
            this.userAnswers[qId] = optionLetter;
        }
        
        this.render();
    }
    
    checkAnswer() {
        const question = this.questions[this.currentIndex];
        const userAnswer = this.userAnswers[question.id];
        let isCorrect = false;
        
        if (question.isMultipleChoice) {
            isCorrect = Utils.arraysEqual(
                (userAnswer || []).sort(),
                question.correctAnswers.sort()
            );
        } else {
            isCorrect = userAnswer === question.correctAnswers[0];
        }
        
        this.updateQuestionHistory(question.id, isCorrect);
        this.quizResults.push(isCorrect);
        if (isCorrect) this.score++;
        
        this.showAnswer = true;
        this.render();
    }
    
    nextQuestion() {
        if (this.currentIndex < this.questions.length - 1) {
            this.currentIndex++;
            this.showAnswer = false;
            this.showHints = false;
            this.render();
        } else {
            this.showResults();
        }
    }
    
    prevQuestion() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.showAnswer = false;
            this.showHints = false;
            this.render();
        }
    }
    
    calculateCategoryScores() {
        const categories = {};
        
        this.questions.forEach((question, index) => {
            const category = question.category;
            if (!categories[category]) {
                categories[category] = { correct: 0, total: 0 };
            }
            categories[category].total++;
            if (this.quizResults[index]) {
                categories[category].correct++;
            }
        });
        
        return Object.entries(categories).map(([name, data]) => ({
            name,
            correct: data.correct,
            total: data.total,
            percentage: Math.round((data.correct / data.total) * 100)
        }));
    }
    
    showResults() {
        const correctCount = this.quizResults.filter(r => r).length;
        const totalQuestions = this.questions.length;
        const rawPercentage = Math.round((correctCount / totalQuestions) * 100);
        
        // Microsoft exam scoring (scaled score 1-1000, pass at 700)
        const scaledScore = Utils.calculateScaledScore(rawPercentage);
        const passed = scaledScore >= 700;
        const testDuration = this.testStartTime ? 
            Math.round((new Date() - this.testStartTime) / 1000) : 0;
        
        const resultsHTML = this.quizMode === 'test' 
            ? this.renderTestResults(scaledScore, passed, rawPercentage, correctCount, totalQuestions, testDuration)
            : this.renderPracticeResults(rawPercentage, correctCount, totalQuestions);
        
        document.getElementById('app').innerHTML = resultsHTML;
    }
    
    renderTestResults(scaledScore, passed, rawPercentage, correctCount, totalQuestions, testDuration) {
        return `
            <div class="card">
                <h1>Exam Complete!</h1>
                
                <div class="score-details">
                    <div class="scaled-score" style="color: ${passed ? '#34a853' : '#ea4335'};">
                        ${scaledScore}
                    </div>
                    <div style="font-size: 18px; color: #666;">
                        Scaled Score (out of 1000)
                    </div>
                    <div style="margin-top: 16px; padding: 16px; border-radius: 8px; 
                                background: ${passed ? '#e6f4ea' : '#fce8e6'};">
                        <strong style="color: ${passed ? '#188038' : '#b31412'};">
                            ${passed ? 'PASS' : 'FAIL'}
                        </strong>
                        <div style="font-size: 14px; margin-top: 8px;">
                            Passing Score: 700 | Your Score: ${scaledScore}
                        </div>
                    </div>
                    <div style="margin-top: 16px; font-size: 14px; color: #666;">
                        Time: ${Math.floor(testDuration / 60)}:${(testDuration % 60).toString().padStart(2, '0')}
                    </div>
                </div>
                
                <div style="text-align: center; margin: 24px 0;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 16px;">
                        Raw Score: ${correctCount} out of ${totalQuestions} (${rawPercentage}%)
                    </div>
                    
                    <div class="category-stats">
                        <h3>Score Breakdown by Category</h3>
                        ${this.calculateCategoryScores().map(cat => `
                            <div class="category-item">
                                <div class="category-header">
                                    <span>${cat.name}</span>
                                    <span>${cat.correct}/${cat.total} (${cat.percentage}%)</span>
                                </div>
                                <div class="category-bar">
                                    <div class="category-fill" style="width: ${cat.percentage}%;"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="buttons">
                    <button class="btn btn-primary" onclick="app.reset()">
                        Start New Exam
                    </button>
                    <button class="btn btn-secondary" onclick="app.reviewAnswers()">
                        Review Answers
                    </button>
                </div>
                
                <div style="margin-top: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px; font-size: 14px; color: #666;">
                    <strong>Note:</strong> This is a practice simulation. In the actual Microsoft exam:
                    <ul style="margin-top: 8px; text-align: left;">
                        <li>Some questions may not be scored (pilot questions)</li>
                        <li>Multi-part questions award partial credit</li>
                        <li>Scaled scores account for question difficulty</li>
                        <li>Results are available immediately for most exams</li>
                    </ul>
                </div>
            </div>
        `;
    }
    
    renderPracticeResults(rawPercentage, correctCount, totalQuestions) {
        const stats = this.calculateMasteryStats();
        
        return `
            <div class="card">
                <h1>Practice Complete!</h1>
                
                <div class="score">${rawPercentage}%</div>
                
                <div style="text-align: center; margin: 24px 0;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 16px;">
                        You got ${correctCount} out of ${totalQuestions} questions correct
                    </div>
                    
                    <div class="category-stats">
                        <h3>Performance by Category</h3>
                        ${this.calculateCategoryScores().map(cat => `
                            <div class="category-item">
                                <div class="category-header">
                                    <span>${cat.name}</span>
                                    <span>${cat.correct}/${cat.total} (${cat.percentage}%)</span>
                                </div>
                                <div class="category-bar">
                                    <div class="category-fill" style="width: ${cat.percentage}%;"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="margin-top: 24px;">
                        <h3>Overall Progress</h3>
                        <div class="stats-grid">
                            <div class="stat-item" style="background: #e6f4ea;">
                                <div class="stat-value" style="color: #34a853;">${stats.mastered}</div>
                                <div class="stat-label">Mastered</div>
                            </div>
                            <div class="stat-item" style="background: #fef7e0;">
                                <div class="stat-value" style="color: #fbbc04;">${stats.learning}</div>
                                <div class="stat-label">Learning</div>
                            </div>
                            <div class="stat-item" style="background: #fce8e6;">
                                <div class="stat-value" style="color: #ea4335;">${stats.weak}</div>
                                <div class="stat-label">Need Practice</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="buttons">
                    <button class="btn btn-primary" onclick="app.reset()">
                        Start New Quiz
                    </button>
                    <button class="btn btn-secondary" onclick="app.reviewAnswers()">
                        Review Answers
                    </button>
                </div>
            </div>
        `;
    }
    
    reviewAnswers() {
        this.currentIndex = 0;
        this.showAnswer = true;
        this.render();
    }
    
    reset() {
        this.currentIndex = 0;
        this.userAnswers = {};
        this.score = 0;
        this.showAnswer = false;
        this.showHints = false;
        this.quizStarted = false;
        this.quizResults = [];
        this.render();
    }
    
    render() {
        const app = document.getElementById('app');
        
        if (!this.quizStarted) {
            app.innerHTML = this.renderSetup();
        } else {
            app.innerHTML = this.renderQuestion();
        }
    }
    
    renderSetup() {
        const stats = this.calculateMasteryStats();
        const masteryPercentage = Math.round((stats.mastered / stats.total) * 100);
        
        return `
            <div class="card">
                <h1>PL-600 Quiz App</h1>
                <p style="text-align: center; color: #666; margin-bottom: 24px;">
                    Power Platform Solution Architect Certification Practice
                </p>
                
                <!-- Progress Overview -->
                <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin-bottom: 12px;">Your Progress</h3>
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
                            <span>Overall Mastery</span>
                            <span style="font-weight: 600;">${masteryPercentage}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${masteryPercentage}%;"></div>
                        </div>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value" style="color: #34a853;">${stats.mastered}</div>
                            <div class="stat-label">Mastered</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" style="color: #ea4335;">${stats.weak}</div>
                            <div class="stat-label">Need Practice</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" style="color: #5f6368;">${stats.unseen}</div>
                            <div class="stat-label">New</div>
                        </div>
                    </div>
                </div>
                
                <!-- Mode Selection -->
                <div class="mode-selection">
                    <h3 style="margin-bottom: 12px;">Select Mode</h3>
                    <div class="mode-card ${this.quizMode === 'practice' ? 'selected' : ''}" 
                         onclick="app.quizMode = 'practice'; app.render()">
                        <h4>Practice Mode</h4>
                        <p style="font-size: 14px; color: #666;">Get immediate feedback after each question</p>
                    </div>
                    <div class="mode-card ${this.quizMode === 'test' ? 'selected' : ''}" 
                         onclick="app.quizMode = 'test'; app.render()">
                        <h4>Test Mode</h4>
                        <p style="font-size: 14px; color: #666;">Simulate PL-600 exam conditions</p>
                        <ul style="font-size: 12px; color: #888; margin-top: 8px; text-align: left; list-style: none;">
                            <li>• 40-60 questions</li>
                            <li>• Microsoft scoring (1-1000 scale)</li>
                            <li>• Pass at 700</li>
                            <li>• Proper category distribution</li>
                        </ul>
                    </div>
                </div>
                
                <!-- Category Selection -->
                <div style="margin-bottom: 20px;">
                    <h3 style="margin-bottom: 12px;">Select Categories</h3>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${this.getOfficialCategories().map(category => {
                            const categoryQuestions = this.allQuestions.filter(q => q.category === category);
                            const categoryMastered = categoryQuestions.filter(q => 
                                this.getQuestionMasteryStatus(q.id).status === 'mastered'
                            ).length;
                            const categoryPercentage = categoryQuestions.length > 0 ? 
                                Math.round((categoryMastered / categoryQuestions.length) * 100) : 0;
                            const questionCount = categoryQuestions.length;
                            const examWeight = this.getCategoryWeight(category);
                            
                            return `
                                <button 
                                    class="topic-badge" 
                                    style="background: ${this.selectedCategories.has(category) ? '#1a73e8' : '#e0e0e0'}; 
                                           color: ${this.selectedCategories.has(category) ? 'white' : '#333'};
                                           border: none; cursor: pointer; padding: 8px 16px;
                                           margin-bottom: 4px;"
                                    onclick="app.toggleCategory('${category}')">
                                    <div>${category}</div>
                                    <div style="font-size: 12px; opacity: 0.8;">
                                        ${examWeight} | ${questionCount} questions | ${categoryPercentage}% mastered
                                    </div>
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <div style="margin-top: 8px;">
                        <button 
                            style="background: none; border: none; color: #1a73e8; cursor: pointer; font-size: 14px;"
                            onclick="app.selectedCategories = new Set(app.getOfficialCategories()); app.render()">
                            Select All
                        </button>
                        <button 
                            style="background: none; border: none; color: #666; cursor: pointer; font-size: 14px; margin-left: 16px;"
                            onclick="app.selectedCategories.clear(); app.render()">
                            Clear All
                        </button>
                    </div>
                </div>
                
                <!-- Question Count (Practice Mode Only) -->
                ${this.quizMode === 'practice' ? `
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin-bottom: 12px;">Number of Questions</h3>
                        <select id="questionCount" 
                                onchange="app.questionCount = this.value === 'all' ? 'all' : parseInt(this.value); app.render()"
                                style="width: 100%; padding: 8px;">
                            <option value="5" ${this.questionCount === 5 ? 'selected' : ''}>5 questions</option>
                            <option value="10" ${this.questionCount === 10 ? 'selected' : ''}>10 questions</option>
                            <option value="15" ${this.questionCount === 15 ? 'selected' : ''}>15 questions</option>
                            <option value="20" ${this.questionCount === 20 ? 'selected' : ''}>20 questions</option>
                            <option value="all" ${this.questionCount === 'all' ? 'selected' : ''}>All questions</option>
                        </select>
                    </div>
                ` : ''}
                
                <button class="btn btn-primary" 
                        onclick="app.startQuiz()"
                        ${this.selectedCategories.size === 0 ? 'disabled' : ''}>
                    Start ${this.quizMode === 'test' ? 'Exam' : 'Quiz'}
                </button>
                
                <div style="margin-top: 20px; padding: 12px; background: #f8f9fa; border-radius: 8px; font-size: 12px; color: #666; text-align: center;">
                    <strong>Total Questions Available:</strong> ${this.allQuestions.length}
                </div>
            </div>
        `;
    }
    
    renderQuestion() {
        const question = this.questions[this.currentIndex];
        if (!question) return '<div class="card">No questions available</div>';
        
        const masteryStatus = this.getQuestionMasteryStatus(question.id);
        const history = this.questionHistory[question.id];
        
        let html = `
            <div class="card">
                <div class="progress">
                    Question ${this.currentIndex + 1} of ${this.questions.length}
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div class="topic-badge">${question.category}</div>
                    ${this.quizMode === 'practice' ? `
                        <div class="topic-badge" style="background: ${masteryStatus.color}; color: white;">
                            ${masteryStatus.label}
                        </div>
                    ` : ''}
                </div>
                
                <div class="question-text">${question.text}</div>
        `;
        
        // Hints section (practice mode only)
        if (this.quizMode === 'practice' && !this.showAnswer && question.hints) {
            html += `
                <div class="hint-section">
                    <button class="hint-toggle" onclick="app.showHints = !app.showHints; app.render()">
                        ${this.showHints ? '🔽' : '▶️'} ${this.showHints ? 'Hide' : 'Show'} Hints
                    </button>
                    ${this.showHints ? `
                        <div class="hint-box">
                            <select class="hint-level" onchange="app.hintLevel = this.value; app.render()">
                                <option value="easy" ${this.hintLevel === 'easy' ? 'selected' : ''}>Easy Hint</option>
                                <option value="medium" ${this.hintLevel === 'medium' ? 'selected' : ''}>Medium Hint</option>
                                <option value="hard" ${this.hintLevel === 'hard' ? 'selected' : ''}>Hard Hint</option>
                            </select>
                            <p>${question.hints[this.hintLevel] || 'No hint available for this level'}</p>
                            ${question.keyWords ? `
                                <div style="margin-top: 8px;">
                                    <strong>Key words:</strong><br>
                                    ${question.keyWords.map(kw => `<span class="keyword">${kw}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // Render options
        html += '<div class="options">';
        question.options.forEach(option => {
            const isSelected = question.isMultipleChoice 
                ? (this.userAnswers[question.id] || []).includes(option.letter)
                : this.userAnswers[question.id] === option.letter;
            
            const isCorrect = this.showAnswer && question.correctAnswers.includes(option.letter);
            const isIncorrect = this.showAnswer && isSelected && !isCorrect;
            
            let className = 'option';
            if (!this.showAnswer && isSelected) className += ' selected';
            if (isCorrect) className += ' correct';
            if (isIncorrect) className += ' incorrect';
            
            html += `
                <button class="${className}" 
                        onclick="app.selectAnswer('${option.letter}')"
                        ${this.showAnswer ? 'disabled' : ''}>
                    <div style="display: flex; align-items: center;">
                        ${question.isMultipleChoice ? 
                            `<input type="checkbox" ${isSelected ? 'checked' : ''} ${this.showAnswer ? 'disabled' : ''} />` :
                            `<input type="radio" name="q${question.id}" ${isSelected ? 'checked' : ''} ${this.showAnswer ? 'disabled' : ''} />`
                        }
                        <span style="margin-left: 8px;">
                            <strong>${option.letter}.</strong> ${option.text}
                        </span>
                    </div>
                </button>
            `;
        });
        html += '</div>';
        
        // Answer feedback
        if (this.showAnswer) {
            const userAnswer = this.userAnswers[question.id];
            const isCorrect = question.isMultipleChoice
                ? Utils.arraysEqual((userAnswer || []).sort(), question.correctAnswers.sort())
                : userAnswer === question.correctAnswers[0];
            
            html += `
                <div class="feedback ${isCorrect ? 'correct' : 'incorrect'}">
                    <strong>${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</strong>
                    <div class="explanation">
                        ${question.explanation || 'No explanation available'}
                    </div>
                    
                    ${question.conceptsTested && question.conceptsTested.length > 0 ? `
                        <div style="margin-top: 16px;">
                            <strong>Concepts Tested:</strong>
                            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
                                ${question.conceptsTested.map(concept => `
                                    <span class="topic-badge" style="background: #e0e0e0; font-size: 12px;">
                                        ${concept}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${question.reference ? `
                        <div style="margin-top: 16px; font-size: 14px;">
                            <strong>Reference:</strong> 
                            <a href="${question.reference}" target="_blank" style="color: #1a73e8;">
                                Microsoft Documentation
                            </a>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // Question history (practice mode only)
        if (this.quizMode === 'practice' && history && history.attempts > 0) {
            html += `
                <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <div style="font-size: 14px; color: #666;">
                        <div>Previous attempts: ${history.attempts}</div>
                        <div>Success rate: ${Math.round((history.correct / history.attempts) * 100)}%</div>
                        <div>Retention score: ${history.retentionScore}%</div>
                    </div>
                </div>
            `;
        }
        
        // Navigation buttons
        html += `
            <div class="buttons">
                <button class="btn btn-secondary" 
                        onclick="app.prevQuestion()"
                        ${this.currentIndex === 0 ? 'disabled' : ''}>
                    Previous
                </button>
                
                ${!this.showAnswer && this.quizMode === 'practice' ? `
                    <button class="btn btn-primary" 
                            onclick="app.checkAnswer()"
                            ${!this.userAnswers[question.id] || 
                              (question.isMultipleChoice && (!this.userAnswers[question.id] || this.userAnswers[question.id].length === 0)) 
                              ? 'disabled' : ''}>
                        Check Answer
                    </button>
                ` : ''}
                
                ${this.showAnswer || this.quizMode === 'test' ? `
                    <button class="btn btn-success" onclick="app.nextQuestion()">
                        ${this.currentIndex === this.questions.length - 1 ? 'Finish' : 'Next'}
                    </button>
                ` : ''}
            </div>
        `;
        
        html += '</div>';
        return html;
    }
}
