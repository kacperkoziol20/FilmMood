// 1. KONFIGURACJA

const CONFIG = {
  TMDB_API_KEY: "64fc2535aea30c392f6e1318f9d296db",
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  IMG_BASE_URL: "https://image.tmdb.org/t/p/w500",
  BACKEND_URL: "http://localhost:5000" 
};


// 2. ELEMENTY DOM I ZMIENNE GLOBALNE

const container = document.getElementById("movies-container");
const moodButtons = document.querySelectorAll(".moods button");
const searchInput = document.getElementById("search");
const trailerContainer = document.getElementById("trailer-container");


// 3. NARZĘDZIA (UTILS)

function debounce(func, timeout = 600) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}


// 4. AUTH (ZARZĄDZANIE UŻYTKOWNIKIEM)

function saveAuth(token, userId) {
  if (token) localStorage.setItem("fm_token", token);
  if (userId) localStorage.setItem("fm_userId", userId);
}

function clearAuth() {
  localStorage.removeItem("fm_token");
  localStorage.removeItem("fm_userId");

}

function getAuth() {
  return {
    token: localStorage.getItem("fm_token"),
    userId: localStorage.getItem("fm_userId") || getOrCreateAnonUser()
  };
}

function getOrCreateAnonUser() {
  let uid = localStorage.getItem("fm_userId");
  if (!uid) {
    uid = "anon_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("fm_userId", uid);
  }
  return uid;
}

async function handleAuthAction(action, email, password, name) {
  const endpoint = action === "register" ? "/api/auth/register" : "/api/auth/login";
  const body = action === "register" ? { email, password, display_name: name } : { email, password };
  
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || "Błąd logowania");
    
    saveAuth(data.token, data.userId);
    if (email) localStorage.setItem("fm_email", email);

  
    const memoryKey = "fm_saved_name_" + email;

    // 1. Jeśli rejestracja -> Zapisz imię na stałe
    if (action === "register" && name) {
        localStorage.setItem("fm_display_name", name); 
        localStorage.setItem(memoryKey, name);         
    } 
    // 2. Jeśli logowanie
    else {
        // Czy backend zwrócił imię?
        if (data.display_name || data.name) {
             const serverName = data.display_name || data.name;
             localStorage.setItem("fm_display_name", serverName);
             localStorage.setItem(memoryKey, serverName);
        } else {
             // Backend milczy -> Sprawdźmy naszą pamięć dla tego maila
             const rememberedName = localStorage.getItem(memoryKey);
             if (rememberedName) {
                 localStorage.setItem("fm_display_name", rememberedName);
             }
        }
    }

    updateAuthUI();
    return { ok: true };
  } catch (err) { 
    return { ok: false, message: err.message }; 
  }
}

function updateAuthUI() {
  const { token } = getAuth();
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const profileBtn = document.getElementById("profile-btn");

  if (loginBtn) loginBtn.style.display = token ? "none" : "inline-block";
  if (logoutBtn) logoutBtn.style.display = token ? "inline-block" : "none";
  
  if (profileBtn) {
    profileBtn.style.display = token ? "inline-block" : "none";
    
    // --- FIX: AUTOMATYCZNE PRZYWRACANIE IMIENIA ---
    let savedName = localStorage.getItem("fm_display_name");
    const email = localStorage.getItem("fm_email");
    
    // Jeśli nie ma imienia w sesji, ale mamy email -> szukamy w pamięci trwałej
    if (!savedName && email) {
        const memoryName = localStorage.getItem("fm_saved_name_" + email);
        if (memoryName) {
            savedName = memoryName;
            localStorage.setItem("fm_display_name", memoryName); // Przywróć do sesji
        }
    }

    profileBtn.textContent = savedName ? `👤 ${savedName}` : "👤 Profil";
  }
}


// 5. API TMDB & BACKEND

const moodGenres = {
  happy: 35, sad: 18, angry: 28, tired: 12, nostalgic: 10751
};

async function getMoviesByMood(mood) {
  const genreId = moodGenres[mood];
  const randomPage = Math.floor(Math.random() * 10) + 1;
  const url = `${CONFIG.TMDB_BASE_URL}/discover/movie?api_key=${CONFIG.TMDB_API_KEY}&language=pl-PL&with_genres=${genreId}&page=${randomPage}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      container.innerHTML = "<p>Nie znaleziono filmów 😢</p>";
      return;
    }
    const randomMovies = shuffleArray(data.results).slice(0, 12);
    await showMovies(randomMovies);
  } catch (error) {
    console.error("❌ Błąd TMDB:", error);
    container.innerHTML = "<p>Wystąpił błąd pobierania danych.</p>";
  }
}

async function searchMovies(query) {
  if (!query || query.trim().length === 0) return;
  const url = `${CONFIG.TMDB_BASE_URL}/search/movie?api_key=${CONFIG.TMDB_API_KEY}&language=pl-PL&query=${encodeURIComponent(query)}&page=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results) return;
    await showMovies(data.results.slice(0, 12));
  } catch (err) { console.error(err); }
}

// Backend: Ulubione
async function addFavoriteBackend(movie) {
  const { token, userId } = getAuth();
  const payload = {
    movieId: movie.id,
    title: movie.title || movie.name,
    poster: movie.poster_path ? `${CONFIG.IMG_BASE_URL}${movie.poster_path}` : (movie.poster || null),
    rating: movie.vote_average || null,
    userId: !token ? userId : undefined
  };
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/favorites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function getFavoritesBackend() {
  const { token, userId } = getAuth();
  try {
    let url = token ? `${CONFIG.BACKEND_URL}/api/favorites/me` : `${CONFIG.BACKEND_URL}/api/favorites/${userId}`;
    let headers = token ? { "Authorization": `Bearer ${token}` } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) { return []; }
}

async function deleteFavoriteBackend(movieId) {
  const { token } = getAuth();
  if (!token) return { ok: false };
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/favorites/me/${movieId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    return { ok: res.ok };
  } catch (err) { return { ok: false }; }
}


// 6. ZWIASTUNY 

async function loadTrailer(movieId) {
  const btn = document.getElementById("trailer-btn");
  const container = document.getElementById("trailer-container");
  
  if(!container || !btn) return;

  btn.textContent = "Szukam...";
  btn.disabled = true;
  container.style.display = "block"; 
  container.innerHTML = "<p style='padding:20px; text-align:center; color:#777;'>Ładowanie...</p>";

  try {
    let url = `${CONFIG.TMDB_BASE_URL}/movie/${movieId}/videos?api_key=${CONFIG.TMDB_API_KEY}&language=pl-PL`;
    let res = await fetch(url);
    let data = await res.json();
    let video = data.results.find(v => v.site === "YouTube" && v.type === "Trailer");
    
    if (!video) {
        url = `${CONFIG.TMDB_BASE_URL}/movie/${movieId}/videos?api_key=${CONFIG.TMDB_API_KEY}&language=en-US`;
        res = await fetch(url);
        data = await res.json();
        video = data.results.find(v => v.site === "YouTube" && v.type === "Trailer");
    }

    if (video) {
      container.innerHTML = `
        <iframe src="https://www.youtube.com/embed/${video.key}?autoplay=1" 
          allow="autoplay; encrypted-media" allowfullscreen>
        </iframe>`;
      btn.textContent = "🎬 Odtwarzanie";
    } else {
      container.innerHTML = "<p style='padding:20px; text-align:center;'>Brak zwiastuna 😢</p>";
      btn.textContent = "Brak wideo";
    }
  } catch (err) {
    container.innerHTML = "<p style='padding:20px; text-align:center; color:red;'>Błąd ładowania</p>";
    btn.textContent = "Błąd";
  } finally {
    btn.disabled = false;
  }
}

function stopTrailer() {
  const container = document.getElementById("trailer-container");
  if (container) {
    container.innerHTML = "";
    container.style.display = "none";
  }
}


// 7. RENDERING (WYŚWIETLANIE)


function showFavorites(favs) {
  container.innerHTML = "";
  if (!favs || favs.length === 0) {
    container.innerHTML = "<p>Brak ulubionych filmów ❤️</p>";
    return;
  }

  favs.forEach(f => {
    const card = document.createElement("article");
    card.className = "movie-card show";

    // --- FIX: Formatowanie oceny (np. 8.1 zamiast 8.149) ---
    const ratingFormatted = f.rating ? Number(f.rating).toFixed(1) : "-";

    card.innerHTML = `
      <div class="poster-wrap">
        <img src="${f.poster || 'https://via.placeholder.com/500x750?text=Brak'}" alt="${f.title}">
        <button class="fav-btn favorited">★</button>
      </div>
      <h3>${f.title}</h3>
      <p class="meta">⭐ ${ratingFormatted}</p>
    `;

    const favBtn = card.querySelector(".fav-btn");
    favBtn.onclick = async (e) => {
      e.stopPropagation();
      if(confirm("Usunąć z ulubionych?")) {
        const res = await deleteFavoriteBackend(f.movieId);
        if (res.ok) card.remove();
        if (container.children.length === 0) container.innerHTML = "<p>Brak ulubionych filmów ❤️</p>";
      }
    };
    
    card.addEventListener("click", (e) => {
        if (e.target.closest(".fav-btn")) return;
        const mappedMovie = {
            id: f.movieId,
            title: f.title,
            poster_path: f.poster ? f.poster.replace(CONFIG.IMG_BASE_URL, "") : null,
            vote_average: f.rating,
            overview: "Szczegóły dostępne po wyszukaniu filmu..." 
        };
        openMovieModal(mappedMovie);
    });

    container.appendChild(card);
  });
}

async function showMovies(movies) {
  container.innerHTML = "";
  const favorites = await getFavoritesBackend();
  const favIds = new Set(favorites.map(f => Number(f.movieId)));

  movies.forEach(movie => {
    const imgPath = movie.poster_path || movie.backdrop_path || movie.poster;
    const poster = imgPath 
      ? (imgPath.startsWith("http") ? imgPath : `${CONFIG.IMG_BASE_URL}${imgPath}`)
      : "https://via.placeholder.com/500x750?text=Brak";

    const title = movie.title || movie.name;
    const year = movie.release_date ? movie.release_date.substring(0, 4) : "";
    
    // --- Formatowanie oceny w widoku ogólnym ---
    const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : "-";

    const card = document.createElement("article");
    card.classList.add("movie-card");
    card.innerHTML = `
      <div class="poster-wrap">
        <img src="${poster}" alt="${title}" loading="lazy">
        <button class="fav-btn" title="Ulubione">☆</button>
      </div>
      <h3>${title}</h3>
      <p class="meta">${year} • ⭐ ${rating}</p>
    `;

    const favBtn = card.querySelector(".fav-btn");
    if (favIds.has(Number(movie.id))) {
      favBtn.classList.add("favorited");
      favBtn.textContent = "★";
    }

    card.addEventListener("click", (e) => {
      if (e.target.closest(".fav-btn")) return;
      openMovieModal(movie);
    });

    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (favBtn.classList.contains("favorited")) {
         const res = await deleteFavoriteBackend(movie.id);
         if (res.ok) {
             favBtn.classList.remove("favorited");
             favBtn.textContent = "☆";
         } else { alert("Musisz być zalogowany!"); }
      } else {
         const res = await addFavoriteBackend(movie);
         if (res.ok) {
             favBtn.classList.add("favorited");
             favBtn.textContent = "★";
         }
      }
    });

    container.appendChild(card);
  });
}


// 8. MODAL FILMU

function openMovieModal(movie) {
  const modal = document.getElementById("movie-detail-modal");
  const posterEl = document.getElementById("movie-modal-poster");
  const titleEl = document.getElementById("movie-modal-title");
  const overviewEl = document.getElementById("movie-modal-overview");
  const ratingEl = document.getElementById("movie-modal-rating");
  const dateEl = document.getElementById("movie-modal-date");
  const favBtn = document.getElementById("movie-modal-fav");
  const trailerBtn = document.getElementById("trailer-btn");
  const trailerBox = document.getElementById("trailer-container");
  const closeBtn = document.getElementById("movie-modal-close");

  if (trailerBox) {
      trailerBox.style.display = "none";
      trailerBox.innerHTML = "";
  }

  const imgPath = movie.poster_path || movie.backdrop_path;
  posterEl.src = imgPath ? `${CONFIG.IMG_BASE_URL}${imgPath}` : "https://via.placeholder.com/300";
  titleEl.textContent = movie.title || movie.name;
  overviewEl.textContent = movie.overview || "Brak opisu.";
  ratingEl.textContent = movie.vote_average ? Number(movie.vote_average).toFixed(1) : "-";
  dateEl.textContent = movie.release_date || "-";

  favBtn.textContent = "Dodaj do ulubionych";
  favBtn.onclick = async () => {
    favBtn.textContent = "Zapisuję...";
    const res = await addFavoriteBackend(movie);
    if(res.ok) favBtn.textContent = "✓ Zapisano!";
    else alert("Błąd zapisu! " + (res.error || ""));
  };

  if(trailerBtn) {
    trailerBtn.textContent = "🎬 Zwiastun";
    trailerBtn.disabled = false;
    const newBtn = trailerBtn.cloneNode(true);
    trailerBtn.parentNode.replaceChild(newBtn, trailerBtn);
    newBtn.onclick = () => loadTrailer(movie.id);
  }

  modal.style.display = "flex";
  setTimeout(() => modal.classList.add("show"), 10);

  const closeModal = () => {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.style.display = "none";
      stopTrailer(); 
    }, 300);
  };

  closeBtn.onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}


// 9. GŁÓWNA INICJALIZACJA 

document.addEventListener("DOMContentLoaded", () => {
  updateAuthUI();
  getMoviesByMood("happy");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => debounce(() => searchMovies(e.target.value), 600)());
  }
  
  moodButtons.forEach(btn => btn.addEventListener("click", () => getMoviesByMood(btn.dataset.mood)));

  const mainFavBtn = document.getElementById("favorites-btn");
  if(mainFavBtn) {
    mainFavBtn.addEventListener("click", async () => {
      const favs = await getFavoritesBackend();
      showFavorites(favs);
    });
  }

  const homeBtn = document.getElementById("home-btn");
  if (homeBtn) {
    homeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const movieModal = document.getElementById("movie-detail-modal");
      if (movieModal) {
        movieModal.classList.remove("show");
        movieModal.style.display = "none";
        stopTrailer();
      }
      if(searchInput) searchInput.value = "";
      getMoviesByMood("happy");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }


  const authModal = document.getElementById("auth-modal");
  const loginBtn = document.getElementById("login-btn");
  const authClose = document.getElementById("auth-close");
  const authSubmit = document.getElementById("auth-submit");
  const switchReg = document.getElementById("switch-to-register");

  if(loginBtn) loginBtn.onclick = (e) => { 
      e.preventDefault(); 
      authModal.style.display = "flex"; 
      setTimeout(()=>authModal.classList.add("show"), 10); 
  };
  
  if(authClose) authClose.onclick = () => { 
      authModal.classList.remove("show"); 
      setTimeout(()=>authModal.style.display = "none", 300); 
  };
  
  if(authSubmit) authSubmit.onclick = async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value;
    const pass = document.getElementById("auth-password").value;
    const name = document.getElementById("auth-name").value;
    const mode = authSubmit.textContent.toLowerCase().includes("rejestr") ? "register" : "login";
    
    authSubmit.textContent = "Przetwarzanie...";
    const res = await handleAuthAction(mode, email, pass, name);
    authSubmit.textContent = mode === "register" ? "Zarejestruj" : "Zaloguj";
    
    if(res.ok) { 
        authModal.classList.remove("show"); 
        setTimeout(()=>authModal.style.display = "none", 300); 
    } else { 
        alert(res.message); 
    }
  };
  
  if(switchReg) switchReg.onclick = (e) => {
     e.preventDefault();
     document.getElementById("auth-title").textContent = "Zarejestruj się";
     authSubmit.textContent = "Zarejestruj";
     document.querySelector("label[for='auth-name']").style.display = "block";
     document.getElementById("auth-name").style.display = "block";
  };
  
  const logoutBtn = document.getElementById("logout-btn");
  if(logoutBtn) logoutBtn.onclick = () => { clearAuth(); updateAuthUI(); alert("Wylogowano"); window.location.reload(); };
});


document.addEventListener("click", async (e) => {
    // 1. Otwieranie
    if (e.target && (e.target.id === "profile-btn" || e.target.closest("#profile-btn"))) {
        e.preventDefault();
        const modal = document.getElementById("profile-modal");
        if (!modal) return;

        
        modal.style.cssText = `
            display: flex !important;
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background-color: rgba(0,0,0,0.95) !important;
            z-index: 2147483647 !important;
            align-items: center !important;
            justify-content: center !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;
        const innerBox = modal.querySelector(".auth-box");
        if(innerBox) innerBox.style.cssText = "display: block !important; background: #1e1e1e !important; padding: 2rem !important; border-radius: 12px !important; position: relative !important; z-index: 2147483648 !important; min-width: 300px !important; color: white !important;";

        // Dane
        const { userId } = getAuth();
        const email = localStorage.getItem("fm_email") || "Brak emaila";
        const name = localStorage.getItem("fm_display_name") || "";

        const idEl = document.getElementById("profile-id");
        const emailEl = document.getElementById("profile-email");
        const nameEl = document.getElementById("profile-name");
        const favEl = document.getElementById("profile-fav-count");

        if(idEl) idEl.textContent = userId;
        if(emailEl) emailEl.textContent = email;
        if(nameEl) nameEl.value = name;
        
        if(typeof getFavoritesBackend === "function") {
            try {
                const favs = await getFavoritesBackend();
                if(favEl) favEl.textContent = favs.length;
            } catch(err) { console.error(err); }
        }
    }

    // 2. Zamykanie
    if (e.target && (e.target.id === "profile-close" || e.target === document.getElementById("profile-modal"))) {
         const modal = document.getElementById("profile-modal");
         if(modal) {
             modal.style.display = "none";
             modal.style.cssText = "display: none !important"; 
         }
    }

    // 3. Zapisywanie
    if (e.target && e.target.id === "profile-save") {
        const nameEl = document.getElementById("profile-name");
        const name = nameEl ? nameEl.value.trim() : "";
        const email = localStorage.getItem("fm_email");

        localStorage.setItem("fm_display_name", name);
        if(email && name) localStorage.setItem("fm_saved_name_" + email, name);

        const btn = document.getElementById("profile-btn");
        if(btn) btn.textContent = name ? `👤 ${name}` : "👤 Profil";
        
        alert("Zapisano!");
        const modal = document.getElementById("profile-modal");
        if(modal) {
             modal.style.display = "none";
             modal.style.cssText = "display: none !important";
        }
    }
});