let connection;

function openDatabase() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('xuong-font-references', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('project');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export async function loadReferences() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('project', 'readonly');
    const store = transaction.objectStore('project');
    const images = store.get('images');
    const state = store.get('state');
    transaction.oncomplete = () => resolve({ images: images.result ?? [], state: state.result ?? {} });
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveReferences(state, images) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('project', 'readwrite');
    const store = transaction.objectStore('project');
    if (images) store.put(images, 'images');
    store.put(state, 'state');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}
