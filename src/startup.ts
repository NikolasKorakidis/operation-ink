// The studio's ident plays over the loading game (once a session); the game loads behind it meanwhile. It is loaded
// on its own, so if it ever fails to load the game still starts.
void import('./brand/intro').then(intro => intro.playBrandIntro()).catch(error => console.error('Studio intro failed', error))
// Keep the initial HTML out of view until the scene and menu are ready.
void import('./main').catch(error => {
  console.error('Game startup failed', error)
  const message = document.createElement('main')
  message.setAttribute('role', 'alert')
  message.style.cssText = 'padding:32px;font:16px/1.6 sans-serif;color:#000'
  const text = document.createElement('p')
  text.textContent = 'Unable to load the game. Reload this page to try again.'
  const retry = document.createElement('button')
  retry.textContent = 'Reload game'
  retry.addEventListener('click', () => location.reload())
  message.append(text, retry)
  document.body.replaceChildren(message)
  document.documentElement.removeAttribute('data-loading')
})
