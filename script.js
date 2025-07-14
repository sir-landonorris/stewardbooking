document.addEventListener('DOMContentLoaded', function() {
    // Все данные бронирования
    const bookingData = {
        date: null,
        time: null,
        simulator: [], // Изменено на массив для множественного выбора
        wheel: null,
        duration: null, // Длительность пакета, например "1 час"
        price: null,
        name: null,
        phone: null,
        telegram: null,
        comment: null
    };

    // Все пакеты времени
    const packages = [
        { duration: '1 час', price: '450 ₽', value: 450, hours: 1 },
        { duration: '2 часа', price: '800 ₽', value: 800, hours: 2 },
        { duration: '3 часа', price: '1050 ₽', value: 1050, hours: 3 },
        { duration: '5 часов', price: '1600 ₽', value: 1600, hours: 5 },
        { duration: 'Ночь', price: '2000 ₽', value: 2000, hours: 8 } // Пример для "Ночь" - 8 часов
    ];

    // Инициализация приложения
    function init() {
        setupCalendar();
        setupSimulatorSelection(); // Перенесено
        setupPackageSelection(); // Новый вызов
        setupTimeSlotsGenerator(); // Генерация слотов на основе выбранного пакета
        setupWheelSelection();
        setupForm();
        setupNavigation();
        setupConfirmationActions();
        setupMapButtons();
        showStep(0);
    }

    // Показываем нужный шаг и скрываем остальные
    function showStep(stepNumber) {
        // Скрываем все шаги
        document.querySelectorAll('.step-page').forEach(step => {
            step.classList.remove('active');
        });
        
        // Показываем нужный шаг
        const steps = [
            'date-select-container', // 0
            'simulator-step',        // 1
            'package-step',          // 2
            'time-select-step',      // 3 (бывший time-step)
            'wheel-step',            // 4
            'form-step',             // 5
            'confirmation-step'      // 6
        ];
        document.getElementById(steps[stepNumber]).classList.add('active');
        
        // Обновляем прогресс-бар (всего 7 шагов, но 0-6)
        updateProgress(stepNumber);
    }

    // Обновляем прогресс-бар
    function updateProgress(step) {
        const progress = (step / (document.querySelectorAll('.step-page').length - 1)) * 100;
        document.getElementById('booking-progress').style.width = `${progress}%`;
    }

    // Настройка выбора даты (без изменений)
    function setupCalendar() {
        const daySelect = document.getElementById('day');
        const monthSelect = document.getElementById('month');
        const today = new Date();
        
        // Заполняем месяцы
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 
            'Май', 'Июнь', 'Июль', 'Август',
            'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        
        monthSelect.innerHTML = months.map((month, index) => 
            `<option value="${index}">${month}</option>`
        ).join('');
        
        monthSelect.value = today.getMonth();
        updateDays();
        
        // Обновляем дни при смене месяца
        monthSelect.addEventListener('change', updateDays);
        daySelect.addEventListener('change', function() {
            updateBookingDate();
        });
        
        function updateDays() {
            const selectedMonth = parseInt(monthSelect.value);
            const year = today.getFullYear();
            const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
            const currentDay = today.getDate();
            
            let options = '';
            for (let i = 1; i <= daysInMonth; i++) {
                const selected = (selectedMonth === today.getMonth() && i === currentDay) ? 'selected' : '';
                options += `<option value="${i}" ${selected}>${i}</option>`;
            }
            
            daySelect.innerHTML = options;
            updateBookingDate();
        }
        
        function updateBookingDate() {
            const day = daySelect.value;
            const month = parseInt(monthSelect.value) + 1;
            const year = today.getFullYear();
            bookingData.date = `${day.padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`;
            document.getElementById('toTimePage').disabled = false; // Кнопка "Далее" на первом шаге
        }
    }

    // Настройка выбора симулятора (изменена логика)
    function setupSimulatorSelection() {
        document.querySelectorAll('.simulator, .simulator-box').forEach(sim => {
            const removeBtn = sim.querySelector('.remove-selection');

            sim.addEventListener('click', function(e) {
                // Если клик был по крестику, то не обрабатываем как выбор
                if (e.target === removeBtn) {
                    return;
                }

                const simulatorId = this.dataset.id;

                if (this.classList.contains('selected')) {
                    // Если уже выбран, снимаем выбор
                    this.classList.remove('selected');
                    removeBtn.style.display = 'none';
                    bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                } else {
                    // Если выбираем "Любой симулятор", то снимаем выбор с других
                    if (simulatorId === 'any') {
                        document.querySelectorAll('.simulator-box.selected').forEach(s => {
                            s.classList.remove('selected');
                            s.querySelector('.remove-selection').style.display = 'none';
                        });
                        bookingData.simulator = ['any'];
                    } else {
                        // Если выбираем конкретный симулятор, то снимаем выбор с "Любого"
                        const anySim = document.querySelector('.simulator.full');
                        if (anySim.classList.contains('selected')) {
                            anySim.classList.remove('selected');
                            anySim.querySelector('.remove-selection').style.display = 'none';
                            bookingData.simulator = [];
                        }
                        
                        // Добавляем или убираем выбранный симулятор
                        if (!bookingData.simulator.includes(simulatorId)) {
                            bookingData.simulator.push(simulatorId);
                        }
                    }
                    this.classList.add('selected');
                    removeBtn.style.display = 'flex';
                }
                
                // Проверяем, должна ли кнопка "Далее" быть активной
                document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
            });

            // Обработчик для крестика
            if (removeBtn) {
                removeBtn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Предотвращаем срабатывание клика на родительском элементе
                    const parentSim = this.closest('.simulator, .simulator-box');
                    if (parentSim) {
                        const simulatorId = parentSim.dataset.id;
                        parentSim.classList.remove('selected');
                        this.style.display = 'none';
                        bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                        document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
                    }
                });
            }
        });
    }

    // Настройка выбора пакета времени (новый шаг)
    function setupPackageSelection() {
        document.getElementById('package-grid').innerHTML = packages.map(pkg => `
            <div class="package" data-duration="${pkg.duration}" data-price="${pkg.value}" data-hours="${pkg.hours}">
                <div>${pkg.duration}</div>
                <div class="price">${pkg.price}</div>
            </div>
        `).join('');
        
        document.querySelectorAll('.package').forEach(pkg => {
            pkg.addEventListener('click', function() {
                document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.duration = this.dataset.duration;
                bookingData.price = this.dataset.price;
                bookingData.hours = parseInt(this.dataset.hours); // Сохраняем количество часов
                document.getElementById('package-summary').textContent = 
                    `Вы выбрали: ${this.dataset.duration} (${this.querySelector('.price').textContent})`;
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator(); // Генерируем слоты после выбора пакета
            });
        });
    }

    // Настройка генерации временных слотов на основе выбранного пакета
    function setupTimeSlotsGenerator() {
        const timeGrid = document.getElementById('time-grid');
        timeGrid.innerHTML = ''; // Очищаем предыдущие слоты

        if (!bookingData.hours) {
            // Если пакет не выбран, не показываем слоты
            return;
        }

        const times = [];
        const interval = 30; // Интервал в минутах, если нужен, сейчас по часу
        const durationHours = bookingData.hours;

        // Создаем временные слоты с 10:00 до 00:00, учитывая длительность пакета
        for (let hour = 10; hour <= 23; hour++) {
            // Слоты для целых часов
            let startHour = hour.toString().padStart(2, '0');
            let endHour = (hour + durationHours).toString().padStart(2, '0');
            let endTimeFormatted = `${endHour}:00`;

            // Если конечная точка переходит через полночь
            if (hour + durationHours >= 24) {
                endHour = (hour + durationHours - 24).toString().padStart(2, '0');
                endTimeFormatted = `${endHour}:00 (следующий день)`;
            }

            times.push(`${startHour}:00 – ${endTimeFormatted}`);
        }

        // Если "Ночь", добавим специальный слот
        if (bookingData.duration === 'Ночь') {
            times.push('00:00 – 08:00'); // Пример для ночного пакета
        }
        
        // Добавляем слоты на страницу
        timeGrid.innerHTML = times.map(time => 
            `<div class="time-slot" data-time-range="${time}">${time}</div>`
        ).join('');
        
        // Обработка выбора времени
        document.querySelectorAll('.time-slot').forEach(slot => {
            slot.addEventListener('click', function() {
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.time = this.dataset.timeRange;
                document.getElementById('toWheelPage').disabled = false;
            });
        });
    }

    // Настройка выбора руля (без изменений)
    function setupWheelSelection() {
        document.querySelectorAll('.wheel').forEach(wheel => {
            wheel.addEventListener('click', function() {
                document.querySelectorAll('.wheel').forEach(w => w.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.wheel = this.dataset.id;
                document.getElementById('toFormPage').disabled = false;
            });
        });
    }

    // Настройка формы (без изменений)
    function setupForm() {
        const phoneInput = document.getElementById('phone');
        phoneInput.value = '+7 ';
        
        // Форматирование номера телефона
        phoneInput.addEventListener('input', function(e) {
            let numbers = e.target.value.replace(/\D/g, '');
            if (numbers.startsWith('7')) numbers = '7' + numbers.substring(1);
            numbers = numbers.substring(0, 11);
            
            let formatted = '+7';
            if (numbers.length > 1) formatted += ' (' + numbers.substring(1, 4);
            if (numbers.length > 4) formatted += ') ' + numbers.substring(4, 7);
            if (numbers.length > 7) formatted += '-' + numbers.substring(7, 9);
            if (numbers.length > 9) formatted += '-' + numbers.substring(9, 11);
            
            e.target.value = formatted;
        });
        
        // Валидация Telegram
        document.getElementById('telegram').addEventListener('input', function(e) {
            this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '');
        });
    }

    // Настройка навигации (изменено)
    function setupNavigation() {
        // Кнопки "Далее"
        document.getElementById('toTimePage').addEventListener('click', () => showStep(1)); // С даты на симулятор
        document.getElementById('toPackagePage').addEventListener('click', () => showStep(2)); // С симулятора на пакет
        document.getElementById('toTimePageNew').addEventListener('click', () => showStep(3)); // С пакета на время
        document.getElementById('toWheelPage').addEventListener('click', () => showStep(4)); // Со времени на руль
        document.getElementById('toFormPage').addEventListener('click', () => showStep(5)); // С руля на форму
        
        // Кнопки "Назад"
        document.getElementById('backToCalendarPage').addEventListener('click', () => showStep(0)); // С симулятора на дату
        document.getElementById('backToSimulatorPage').addEventListener('click', () => showStep(1)); // С пакета на симулятор
        document.getElementById('backToPackagePage').addEventListener('click', () => showStep(2)); // Со времени на пакет
        document.getElementById('backToTimePageNew').addEventListener('click', () => showStep(3)); // С руля на время
        document.getElementById('backToWheelPage').addEventListener('click', () => showStep(4)); // С формы на руль
        
        // Отправка формы
        document.getElementById('booking-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Проверяем валидность формы
            if (!this.checkValidity()) {
                this.reportValidity();
                return;
            }
            
            // Сохраняем данные
            bookingData.name = this.querySelector('input[type="text"]').value;
            bookingData.phone = this.querySelector('input[type="tel"]').value;
            bookingData.telegram = this.querySelector('#telegram').value;
            bookingData.comment = this.querySelector('textarea').value;
            
            // Показываем подтверждение
            showConfirmation();
        });
    }

    // Показываем страницу подтверждения (изменено отображение симуляторов)
    function showConfirmation() {
        const details = document.getElementById('confirmation-details');
        
        details.innerHTML = `
            <p><strong>Дата:</strong> ${bookingData.date}</p>
            <p><strong>Тариф:</strong> ${bookingData.duration}</p>
            <p><strong>Время:</strong> ${bookingData.time}</p>
            <p><strong>Симулятор(ы):</strong> ${getSimulatorNames(bookingData.simulator)}</p>
            <p><strong>Руль:</strong> ${getWheelName(bookingData.wheel)}</p>
            <p><strong>Имя:</strong> ${bookingData.name}</p>
            <p><strong>Телефон:</strong> ${bookingData.phone}</p>
            <p><strong>Telegram:</strong> @${bookingData.telegram}</p>
            ${bookingData.comment ? `<p><strong>Комментарий:</strong> ${bookingData.comment}</p>` : ''}
        `;
        
        showStep(6);
    }

    // Настройка действий на странице подтверждения (без изменений)
    function setupConfirmationActions() {
        // Записаться снова
        document.getElementById('book-again').addEventListener('click', resetBooking);
        
        // Перенести запись
        document.getElementById('reschedule').addEventListener('click', function() {
            document.getElementById('reschedule-message').style.display = 'block';
            setTimeout(() => {
                document.getElementById('reschedule-message').style.display = 'none';
            }, 3000);
        });
        
        // Отменить запись
        document.getElementById('cancel-booking').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'flex';
        });
        
        document.getElementById('confirm-cancel').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'none';
            document.getElementById('cancel-message').style.display = 'block';
            setTimeout(() => {
                document.getElementById('cancel-message').style.display = 'none';
                resetBooking();
            }, 1500);
        });
        
        document.getElementById('cancel-cancel').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'none';
        });
    }

    // Настройка кнопок карты и такси (без изменений)
    function setupMapButtons() {
        const address = 'Ростов-на-Дону, ул. Б. Садовая, 70';
        
        // Кнопка "Проложить маршрут"
        document.getElementById('route-btn').addEventListener('click', function() {
            const url = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}`;
            window.open(url, '_blank');
        });
        
        // Кнопка "Вызвать такси"
        document.getElementById('taxi-btn').addEventListener('click', function() {
            const url = `https://3.redirect.appmetrica.yandex.com/route?end-lat=47.222078&end-lon=39.720349&end-name=${encodeURIComponent(address)}`;
            window.open(url, '_blank');
        });
    }

    // Сброс бронирования (изменено)
    function resetBooking() {
        // Очищаем данные
        for (const key in bookingData) {
            if (key === 'simulator') {
                bookingData[key] = []; // Сброс массива
            } else {
                bookingData[key] = null;
            }
        }
        
        // Сбрасываем форму
        document.getElementById('booking-form').reset();
        document.getElementById('phone').value = '+7 ';
        
        // Снимаем выделения и скрываем крестики
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.remove-selection').forEach(el => el.style.display = 'none');
        
        // Сбрасываем кнопки
        document.querySelectorAll('.next-btn').forEach(btn => btn.disabled = true);
        document.getElementById('toTimePage').disabled = false; // Первая кнопка всегда активна
        
        // Возвращаемся к первому шагу
        showStep(0);
    }

    // Вспомогательные функции (calculateEndTime больше не нужна, getWheelName без изменений)
    function getWheelName(wheelId) {
        const wheels = {
            'ks': 'Штурвал KS',
            'cs': 'Круглый CS',
            'nobutton': 'Круглый без кнопок',
            'any': 'Выберу на месте'
        };
        return wheels[wheelId] || wheelId;
    }

    function getSimulatorNames(simulatorIds) {
        if (simulatorIds.includes('any')) {
            return 'Любой';
        }
        return simulatorIds.map(id => `Симулятор #${id}`).join(', ');
    }

    // Запускаем приложение
    init();
});
