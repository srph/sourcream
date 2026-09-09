I want to make a local video streaming website so I can watch movies I've downloaded. For now, I'll manually download the movies, including the subtitles. The idea is I'll serve a UI and the files through LAN (and quite possibly WAN, later). Its primary device will be for Samsung TV / Tizen 7.2. Maybe we can add desktop support and even partial mobile support, but that's not required. The list of movies and its details are stored on a SQLite database. The movies are not automatically picked up. We will manually add them to the SQLite database via a skill and some scripts as needed. If we need to transcode the video files, then we may have to write a script (depending on what the best format is for our use-case). Movies are in D:\Movies and haven't been organized yet. There's a good example in there: the Perfume movie, just check.

- Stack
    - Local DB (SQLite), Drizzle
    - Next, Tailwind, Base UI
        - Grab components from shadcn (i.e. button, chips, etc) and restyle as needed
        - Use Inter font
    - No video player library (or whatever your recommendation is; I prefer full control so we can optimize as needed)
        - Press video to play/pause
        - [Current time] [Video slider] [Duration]
        - [Play/Pause] [Volume] [Title] [Subtitles] [Full Screen]
        - Press right: fast forward by 15s
        - Hold right: fast forward by 2x; Pressing right further increases rate (max to 8x)
- Key Details
    - Samsung TV / Tizen 7.2
    - Interactions are intended for TV-first
        - Minimize motion to just scale, translate, opacity since we're running on TV
        - Design with focus-visible in mind
    - Pages are index (/), search (?q=), watch (/w/:id)
    - Persist things like movie timestamp to local storage
    - Files are served from a hard-drive (my 8TB drive here)
    - I provide movies and subtitles from my own sources
    - New websites probably should be added via skill, but we'll want a script to generate frames
- Backlogs (For Later)
    - Series support; movies only for now
    - WAN support; so my neighbor/families can have direct access
- Local Video Streaming Website
    - Can Wifi (TV) access Wired (PC)? Yes
    - How good is Tizen browser? Good enough, just minimize transitions and use older browsers
    - What would it take to enable WAN access within the same country (700mbps download/upload)? Good enough for a few people
    - What file formats is ideal for this use-case?

Feel free to ask questions
