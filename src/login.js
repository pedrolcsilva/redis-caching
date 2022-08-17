document.getElementById('login').addEventListener('click', () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const options = { 
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        credentials: "include",
        body: JSON.stringify({username, password})
    };
    console.log(options)

    fetch('http://localhost:8080/login', options)
    .then(response => response.json())
    .then(data => {
        window.location = '/index.html'
    })
    .catch(err => {
        console.log(err)
    });
})