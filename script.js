document.addEventListener("DOMContentLoaded", async () => {
    const leagueId = "1091058234531627008";
    const elements = {
        standingsTable: document.getElementById("standings-body"),
        loadingMessage: document.getElementById("loading"),
        rosterContainer: document.getElementById("rosters"),
        topPerformersContainer: document.getElementById("top-performers")
    };

    // Fetch API data
    async function fetchLeagueData() {
        try {
            const [usersResponse, rostersResponse, leagueResponse, playersResponse, statsResponse] = await Promise.all([
                fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
                fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
                fetch(`https://api.sleeper.app/v1/league/${leagueId}`),
                fetch("https://api.sleeper.app/v1/players/nfl"),
                fetch(`https://api.sleeper.app/v1/stats/nfl/regular/2024`)

            ]);

            return {
                users: await usersResponse.json(),
                rosters: await rostersResponse.json(),
                leagueData: await leagueResponse.json(),
                players: await playersResponse.json(),
                stats: await statsResponse.json()
            };
        } catch (error) {
            console.error("Error fetching Sleeper data:", error);
            elements.loadingMessage.textContent = "Failed to load standings.";
            throw error;
        }
    }

    // Process player data
    function processPlayerData(playerId, playerInfo, stats, ownerName) {
        const player = playerInfo[playerId] || {};
        const playerStats = stats[playerId] || {};
        
        return {
            id: playerId,
            name: player.full_name || "Unknown Player",
            position: player.position || "N/A",
            team: player.team || "FA",
            points: playerStats.pts_half_ppr || 0,
            owner: ownerName
        };
    }

    // Organize players into starters and bench
    function organizeRoster(players) {
        let starters = [];
        let bench = [];
        let positionCounts = { QB: 0, RB: 0, WR: 0, TE: 0 };
        const positionLimits = { QB: 1, RB: 4, WR: 4, TE: 1 };

        for (let player of players) {
            if (player.position in positionCounts) {
                if (positionCounts[player.position] < positionLimits[player.position]) {
                    starters.push(player);
                    positionCounts[player.position]++;
                } else {
                    bench.push(player);
                }
            } else {
                bench.push(player);
            }
        }

        // Sort starters by position order
        const positionOrder = { QB: 1, RB: 2, WR: 3, TE: 4 };
        starters.sort((a, b) => (positionOrder[a.position] || 99) - (positionOrder[b.position] || 99));

        return { starters, bench };
    }

    // Create team data
    function createTeamData(rosters, users, players, stats) {
        let positionRanks = { QB: [], RB: [], WR: [], TE: [] };
        
        let teams = rosters.map(roster => {
            const user = users.find(u => u.user_id === roster.owner_id) || { display_name: "Unknown" };
            
            // Process all players on roster
            const playerData = (roster.players || []).map(playerId => 
                processPlayerData(playerId, players, stats, user.display_name)
            );
            
            // Sort players by fantasy points
            playerData.sort((a, b) => b.points - a.points);
            
            // Find MVP (highest scorer regardless of position)
            const mvp = playerData.length > 0 ? playerData[0] : null;
            
            // Organize into starters and bench
            const { starters, bench } = organizeRoster(playerData);
            
            // Add to position rankings
            starters.forEach(player => {
                if (positionRanks[player.position]) {
                    positionRanks[player.position].push(player);
                }
            });

            return {
                rosterId: roster.roster_id,
                name: user.display_name,
                wins: roster.settings.wins || 0,
                losses: roster.settings.losses || 0,
                points: (roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100,
                starters,
                bench,
                mvp
            };
        });

        // Sort teams by wins, then points
        teams.sort((a, b) => b.wins - a.wins || b.points - a.points);
        
        return { teams, positionRanks };
    }

    // Render standings table with sorting
    function renderStandings(teams, tableElement) {
        tableElement.innerHTML = ""; // Clear previous rows

        teams.forEach((team, index) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${team.name}</td>
                <td>${team.wins}</td>
                <td>${team.losses}</td>
                <td>${team.points.toFixed(2)}</td>
            `;
            tableElement.appendChild(row);
        });

        setupSorting(tableElement);
    }

    // Add sorting functionality to headers
    function setupSorting(tableElement) {
        const headers = document.querySelectorAll("#standings thead th");
        headers.forEach((header, index) => {
            header.addEventListener("click", () => {
                const order = header.dataset.order === "asc" ? "desc" : "asc";
                headers.forEach(h => h.dataset.order = ""); // Reset others
                header.dataset.order = order;
                sortStandings(tableElement, index, order);

                // Update header display
                headers.forEach(h => h.textContent = h.textContent.replace(/ ⬆| ⬇/, ""));
                header.textContent += order === "asc" ? " ⬆" : " ⬇";
            });
        });
    }

    // Sorting function
    function sortStandings(tableElement, columnIndex, order) {
        let rows = Array.from(tableElement.querySelectorAll("tr"));

        rows.sort((a, b) => {
            let aValue = a.children[columnIndex].textContent.trim();
            let bValue = b.children[columnIndex].textContent.trim();

            // Convert numbers properly
            if (!isNaN(aValue) && !isNaN(bValue)) {
                aValue = parseFloat(aValue);
                bValue = parseFloat(bValue);
            }

            return order === "asc" ? aValue > bValue ? 1 : -1 : aValue < bValue ? 1 : -1;
        });

        rows.forEach(row => tableElement.appendChild(row));
    }


    // Render team rosters
    function renderRosters(teams, containerElement) {
        teams.forEach(team => {
            const rosterDiv = document.createElement("div");
            rosterDiv.className = "roster-container";
            rosterDiv.innerHTML = `
                <h3>${team.name} (${team.wins}-${team.losses})</h3>
                <input type="text" class="filter-input" placeholder="Search players..." data-team="${team.rosterId}">
                <table class="roster-table">
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th>Position</th>
                            <th>Team</th>
                            <th>Fantasy Points</th>
                        </tr>
                    </thead>
                    <tbody id="roster-${team.rosterId}">
                        ${team.starters.map(player => `
                            <tr>
                                <td>${player.name} ${team.mvp && team.mvp.id === player.id ? "🏆 MVP" : ""}</td>
                                <td>${player.position}</td>
                                <td>${player.team}</td>
                                <td>${player.points.toFixed(2)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
                <button class="toggle-bench" data-team="${team.rosterId}">Show Bench</button>
                <div class="bench-container" id="bench-${team.rosterId}" style="display: none;">
                    <table class="bench-table">
                        <thead>
                            <tr>
                                <th>Player</th>
                                <th>Position</th>
                                <th>Team</th>
                                <th>Fantasy Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${team.bench.map(player => `
                                <tr>
                                    <td>${player.name} ${team.mvp && team.mvp.id === player.id ? "🏆 MVP" : ""}</td>
                                    <td>${player.position}</td>
                                    <td>${player.team}</td>
                                    <td>${player.points.toFixed(2)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;
            containerElement.appendChild(rosterDiv);
        });
    }

    // Render top performers
    function renderTopPerformers(positionRanks, containerElement) {
        // Sort and limit to top 3 for each position
        for (let position in positionRanks) {
            positionRanks[position].sort((a, b) => b.points - a.points);
            positionRanks[position] = positionRanks[position].slice(0, 3);
        }

        containerElement.innerHTML = `
            <h2>Top Performers</h2>
            <table class="top-performers-table">
                <thead>
                    <tr>
                        ${Object.keys(positionRanks).map(pos => `<th>${pos}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${[0, 1, 2].map(rank => `
                        <tr>
                            ${Object.keys(positionRanks).map(pos => {
                                const player = positionRanks[pos][rank];
                                return player ? `<td><strong>${player.name}</strong><br>${player.owner}<br>${player.points.toFixed(2)} pts</td>` : "<td>N/A</td>";
                            }).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    // Setup event listeners
    function setupEventListeners() {
        document.querySelectorAll(".toggle-bench").forEach(button => {
            button.addEventListener("click", event => {
                const teamId = event.target.dataset.team;
                const benchDiv = document.getElementById(`bench-${teamId}`);
                benchDiv.style.display = benchDiv.style.display === "none" ? "block" : "none";
                event.target.textContent = benchDiv.style.display === "none" ? "Show Bench" : "Hide Bench";
            });
        });

        // You could add player search functionality here
    }

    // Main execution
    try {
        const data = await fetchLeagueData();
        const { teams, positionRanks } = createTeamData(data.rosters, data.users, data.players, data.stats);
        
        renderStandings(teams, elements.standingsTable);
        renderRosters(teams, elements.rosterContainer);
        renderTopPerformers(positionRanks, elements.topPerformersContainer);
        setupEventListeners();
        
        elements.loadingMessage.style.display = "none";
    } catch (error) {
        console.error("Failed to initialize dashboard:", error);
    }
    
});


