const $loading = document.getElementById('loading');
const $error = document.getElementById('error');
const $students = document.getElementById('students');
const $status = document.getElementById('status');
const $homeworks = document.getElementById('homeworks');
const $footer = document.getElementById('footer');

let students = JSON.parse(localStorage.getItem('students'));
let selectedKey;

(function init() {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));

  const searchParams = new URLSearchParams('?' + window.location.hash.slice(1));
  const names = searchParams.getAll('student');
  const keys = searchParams.getAll('key');

  if (names.length === 0 && keys.length === 0) {
    if (!students) {
      error('Please sign in using the parent link you originally received by email.');
      return;
    }
    let hash = '';
    for (const student of students) {
      hash += (hash.length === 0 ? '#' : '&') + `key=${student.key}&student=${student.name}`;
    }
    window.location.hash = hash;
    initUI();
    return;
  }

  const invalidLink = 'The link you clicked is invalid.';
  if (names.length !== keys.length || keys.find(o => o.length !== 22 && o.length !== 43)) {
    error(invalidLink);
    localStorage.clear();
    return;
  }
  if (students) {
    if (students.length !== keys.length) {
      students = null;
    } else {
      for (let i = 0; i < keys.length; i++) {
        const existing = students.find(o => o.key === keys[i]);
        if (!existing || existing.name !== names[i]) {
          students = null;
          break;
        }
      }
    }
  }
  if (students) {
    initUI();
    return;
  }
  localStorage.clear();
  students = [];
  for (let i = 0; i < keys.length; i++) students.push({ key: keys[i], name: names[i] });
  let successes = 0;
  for (const key of keys) {
    fetch(new Request(apiPath + key)).then(response => {
      if (response.status === 429) error('The server has detected too many signin attempts. Please try again later.');
      else if (!response.ok) error(invalidLink);
      else return response.json();
    }).catch(() => error('Unable to connect.')).then(json => {
      if (!json) return;
      const student = students.find(o => o.key === key);
      student.homeworks = json;
      student.timestamp = Date.now();
      if (++successes === students.length) {
        localStorage.setItem('students', JSON.stringify(students));
        initUI();
      }
    });
  }

  function initUI() {
    selectedKey = localStorage.getItem('selected') ?? students[0].key;
    if (students.length === 1) {
      $students.innerText = students[0].name;
    } else {
      for (let i = 0; i < students.length; i++) {
        const $radio = document.createElement('input');
        $radio.setAttribute('type', 'radio');
        $radio.setAttribute('name', 'students');
        $radio.setAttribute('value', students[i].key);
        $radio.setAttribute('onchange', 'changeStudent(this.value)');
        if (students[i].key === selectedKey) $radio.setAttribute('checked', 'checked');
        const $label = document.createElement('label');
        $label.appendChild($radio);
        $label.innerHTML += ' ' + students[i].name;
        $students.appendChild($label);
      }
    }
    changeStudent(selectedKey);
    $loading.style.display = 'none';
    $students.style.display = 'block';
    $status.style.display = 'block';
    $homeworks.style.display = 'block';
    $footer.style.display = 'block';
  }
})();

window.onhashchange = () => window.location.reload();

function error(msg) {
  $loading.style.display = 'none';
  $students.style.display = 'none';
  $status.style.display = 'none';
  $homeworks.style.display = 'none';
  $footer.style.display = 'none';
  $error.innerText = msg;
  $error.style.display = 'block';
}

function changeStudent(key) {
  selectedKey = key;
  localStorage.setItem('selected', selectedKey);
  const cached = students.find(o => o.key === key);
  displayHomeworks(cached, false);
  if (Date.now() - cached.timestamp <= 10 * 60 * 1000) {
    setStatus('ready');
  } else if (navigator.onLine) {
    setStatus('refreshing');
    getHomeworks(cached).then(student => displayHomeworks(student, true));
    fetch(new Request(apiPath.replace('/homework/', '')));
  } else {
    setStatus('offline');
  }

  function displayHomeworks(student, fromOnline) {
    if (!student) {
      setStatus('offline');
      return;
    }
    if (selectedKey !== student.key) return;    

    const tomorrowList = [], upcomingList = [], pastList = [];

    const days = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(+today + (today.getDay() < 5 ? 1 : 8 - today.getDay()) * days);
    for (const hw of student.homeworks) {
      const date = new Date(hw.dueDate);
      if (+date === +tomorrow) {
        tomorrowList.push(createElement(hw, null));
      } else {
        (date > tomorrow ? upcomingList : pastList).push(createElement(hw, getDateText(date)));
      }
    }

    if (tomorrowList.length + upcomingList.length + pastList.length === 0) {
      $homeworks.innerHTML = '<h2>No current homework.</h2>';
    } else {
      $homeworks.innerHTML = '';
      createSection('tomorrow', 'Due ' + (today.getDay() < 5 ? 'tomorrow' : 'on Monday'), tomorrowList);
      createSection('upcoming', 'Upcoming', upcomingList);
      createSection('past', 'Past week', pastList.reverse());
    }

    if (fromOnline) setStatus('ready');

    function createElement(hw, dateText) {
      const desc = hw.description.replace(/\n/g, ' ');
      const $el = document.createElement('div');
      $el.className = 'homework';
      $el.innerHTML = `<header><b>${hw.subject}${dateText ? ' <span>(due ' + dateText + ')</span>' : ''}</b></header><main><p><b>${hw.title}</b></p><p>${desc}</p></main>`;
      return $el;
    }

    function getDateText(date) {
      if (+date === +today) return 'today';
      if (+date === +today - 1 * days) return 'yesterday';
      if (date > today && +date < +today + 7 * days) return date.toString().slice(0, 3);
      return `${date.toString().slice(0, 3)} ${date.toLocaleDateString('en-GB')}`;
    }

    function createSection(id, text, children) {
      if (children.length === 0) return;
      const $container = document.createElement('div');
      $container.id = id;
      $container.innerHTML = `<h2>${text}</h2>`;
      for (const $el of children) $container.appendChild($el);
      $homeworks.appendChild($container);
    }
  }
}

function setStatus(status) {
  $status.className = status;
  switch (status) {
    case 'ready':
    case 'refreshing':
      $status.innerHTML = '';
      break;
    case 'offline':
      const date = new Date(students.find(o => o.key === selectedKey).timestamp);
      $status.innerHTML = `Unable to connect.<br/>Last updated: ${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB')}`;
      break;
  }
}

async function getHomeworks(cachedItem) {
  let response;
  try {
    if (!navigator.onLine) throw 'Offline';
    response = await fetch(new Request(apiPath + cachedItem.key));
    if (!response.ok) throw response.statusText;
  } catch (err) {
    err = (typeof (err) === 'object') ? 'Unable to connect' : err;
    console.log('Fetch failed: ' + err);
    return;
  }
  cachedItem.homeworks = (await response.json()).sort((a, b) => (a.dueDate - b.dueDate));
  cachedItem.timestamp = Date.now();
  localStorage.setItem('students', JSON.stringify(students));
  return cachedItem;
}

function signOut() {
  localStorage.clear();
  window.location.hash = '';
}
