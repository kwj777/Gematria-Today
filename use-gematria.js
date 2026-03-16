import { englishGematria } from '.netlify/functions/englishGematria.mjs';

const form = document.querySelector('#gematria-form');
const wordInput = document.querySelector('#word-input');
const result = document.querySelector('#gematria-result');

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const word = wordInput.value.trim();

  if (!word) {
    result.textContent = 'Please enter a word.';
    return;
  }

  const gematriaValue = englishGematria(word);
  result.textContent = `Base-6 English Gematria for "${word}": ${gematriaValue}`;
});
