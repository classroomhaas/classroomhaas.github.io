import pygame  # uses Pygame
import pygame.freetype
import settings  
import sprites
import spritesheet
import controls
import json # uses external Python modules

# uses OOP


class Game:
    """A class for a game of Gun Mayhem."""

    def __init__(self, player_1_name="Player 1", player_2_name="Player 2", player_1_color="green", player_2_color="red"):
        """Initializes pygame."""
        pygame.init()
        pygame.mixer.init()
        self.load_and_set_icon()
        self.screen = pygame.display.set_mode(
            (settings.WIDTH, settings.HEIGHT))
        pygame.display.set_caption(settings.TITLE)
        self.clock = pygame.time.Clock()
        self.running = True

        # set player names and colors
        self.player_1_name = player_1_name
        self.player_2_name = player_2_name
        self.player_1_color = player_1_color
        self.player_2_color = player_2_color

    def new(self):
        """Starts a new Gun Mayhem game."""
        self.players = pygame.sprite.Group()
        self.platforms = pygame.sprite.Group()
        self.bullets = pygame.sprite.Group()
        self.all_sprites = pygame.sprite.Group()

        self.load_images()
        self.load_sfx()
        self.load_font()
        self.add_platforms()
        self.add_players()
        self.add_scoreboards()
        self.run()

    def load_sfx(self):
        """Loads sound files from disk and populates a dictionary object with them."""
        # uses files
        Sound = pygame.mixer.Sound
        self.sfx = {}

        sound = Sound("assets/sfx/shooting/plasma_rife_fire.wav")
        sound.set_volume(0.4)
        self.sfx.update({"shoot": sound})

        sound = Sound("assets/sfx/player/hit.wav")
        sound.set_volume(0.6)
        self.sfx.update({"hit": sound})

        sound = Sound("assets/sfx/ambience/ambience_spacecraft_loop.wav")
        sound.set_volume(0.3)
        self.sfx.update({"ambience": sound})

        sound = Sound("assets/sfx/movement/jump.wav")
        sound.set_volume(0.8)
        self.sfx.update({"jump": sound})

        sound = Sound("assets/sfx/movement/step.wav")
        sound.set_volume(0.4)
        self.sfx.update({"step": sound})

        sound = Sound("assets/sfx/player/death.wav")
        sound.set_volume(0.5)
        self.sfx.update({"death": sound})

    def sfx_shoot(self):
        sound = self.sfx.get("shoot")
        sound.play()

    def sfx_hit(self):
        sound = self.sfx.get("hit")
        sound.play()

    def loop_ambience(self):
        sound = self.sfx.get("ambience")
        sound.play(loops=-1)

    def load_and_set_icon(self):
        """Loads surface from image file from disk and sets it as the game icon."""
        icon = pygame.image.load("assets/icon/icon.png")
        pygame.display.set_icon(icon)

    def load_font(self):
        """Loads font from file and sets it to self.font"""
        self.font = pygame.freetype.Font(
            "assets/font/OpenSans-Regular.ttf", 16)

    def add_scoreboards(self):
        """Creates two scoreboard sprites at their proper locations and adds them to the all_sprites group."""
        self.add_scoreboard(self.player_1, settings.WIDTH -
                            175, settings.HEIGHT - 20)
        self.add_scoreboard(self.player_2, 175, settings.HEIGHT - 20)

    def add_scoreboard(self, player: sprites.Player, x: int, y: int) -> None:
        """
        Creates a single scoreboard and adds it to the all_sprites group.

        Parameters:
        player (sprites.Player): the player the scoreboard belongs to.
        x (int): the x coordinate of the center of the scoreboard.
        y (int): the y coordinate of the center of the scoreboard.
        """
        scoreboard = sprites.Scoreboard(
            self.font, settings.WHITE, (x, y), player)
        self.all_sprites.add(scoreboard)

    def add_platforms(self):
        """Creates and adds platforms to self.platforms and self.all_sprites."""
        for platform_attributes in settings.PLATFORM_LIST:
            coordinates, tile_count = platform_attributes
            platform = sprites.Platform(
                self.platform_image,
                coordinates,
                tile_count
            )
            self.platforms.add(platform)
            self.all_sprites.add(platform)

    def parse_spritesheet_json(self, file_path: str) -> list[pygame.Rect]:
        """
        Returns a list of pygame.Rect objects representing each individaul frame of the sprite sheet.

        Parameters:
        file_path (str): path to json file containing spritesheet information.
        """
        with open(file_path) as f:
            data = json.load(f)
        frame_names = tuple(data["frames"].keys())

        # uses arrays
        rect_list = []
        for frame_name in frame_names:
            dimensions = data["frames"][frame_name]["frame"]
            x, y, w, h = dimensions["x"], dimensions["y"], dimensions["w"], dimensions["h"]
            rect_list.append(pygame.Rect(x, y, w, h))

        return rect_list

    def get_player_animations(self, color: str = "black") -> sprites.Animation:
        """
        Generates and returns a Animation object based on input color.

        Parameters:
        color (str): the color of the player model. Must match file directory name.
        """

        idle_frames = self.get_frames(color, "idle")
        run_frames = self.get_frames(color, "run")
        jump_frames = self.get_frames(color, "jump")
        animation = sprites.Animation(idle_frames, run_frames, jump_frames)
        return animation

    def get_frames(self, color: str, animation_name: str) -> list[pygame.Surface]:
        """
        Returns a list of pygame.Surface objects based on input color and animation name.

        Parameters:
        color (str): the color of the player model. Must match file directory name.
        animation_name (str): the name of the animation (eg. "run"). Must match file name.
        """

        image = pygame.image.load(
            "assets/player/{}/{}.png".format(color, animation_name))
        sheet = spritesheet.Spritesheet(image)
        rect_list = self.parse_spritesheet_json(
            "assets/player/{}.json".format(animation_name))
        frames = sheet.get_frames(rect_list)
        return frames

    def add_players(self):
        """Creates and adds the players to self.players and self.all_sprites."""

        player_1_animations = self.get_player_animations(
            self.player_1_color)
        player_2_animations = self.get_player_animations(
            self.player_2_color)

        self.player_1 = sprites.Player(
            name=self.player_1_name,
            controls=controls.PLAYER_1_CONTROLS,
            spawn_point=settings.PLAYER_1_SPAWN_POINT,
            animation=player_1_animations,
            direction=settings.PLAYER_1_SPAWN_DIRECTION,
            muzzle_flash=self.muzzle_flash,
            sfx=self.sfx
        )

        self.player_2 = sprites.Player(
            name=self.player_2_name,
            controls=controls.PLAYER_2_CONTROLS,
            spawn_point=settings.PLAYER_2_SPAWN_POINT,
            animation=player_2_animations,
            direction=settings.PLAYER_2_SPAWN_DIRECTION,
            muzzle_flash=self.muzzle_flash,
            sfx=self.sfx
        )

        self.players.add(self.player_1)
        self.all_sprites.add(self.player_1)
        self.players.add(self.player_2)
        self.all_sprites.add(self.player_2)

    def run(self):
        """Starts the game loop."""
        self.loop_ambience()
        self.playing = True
        while self.playing:
            self.clock.tick(settings.FPS)
            self.handle_events()
            self.update()
            self.render()

    def handle_events(self):
        """Handles pygame events."""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.playing = False
                self.running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    self.playing = False # restart game
                else:
                    for player in self.players:
                        if event.key == player.controls.SHOOT:
                            self.fire_bullet(player)

    def fire_bullet(self, player: sprites.Player) -> None:
        """
        Creates a bullet on the screen and adds recoil effect to the player.

        Parameters:
        player (sprites.Player): the player that shot the bullet.
        """

        player.shooting = True
        self.add_bullet(player)
        self.sfx_shoot()
        self.add_recoil(player)

    def add_recoil(self, player: sprites.Player) -> None:
        """
        Changes the velocity of the player according to the recoil settings.

        Parameters:
        player (sprites.Player): the player to add the recoil effect to.
        """

        if player.direction == "left":
            player.vel.x += settings.GUN_RECOIL
        else:
            player.vel.x += -settings.GUN_RECOIL

    def load_images(self):
        """Loads necessary images from file, converts them to surfaces, and stores them in appropriate variables."""
        self.bullet_image = pygame.image.load(
            "assets/bullet/bullet.png").convert()
        self.platform_image = pygame.image.load(
            "assets/platform/platform.png").convert()
        self.background = pygame.image.load(
            "assets/background/night.png").convert()
        self.muzzle_flash = pygame.image.load(
            "assets/misc/muzzle_flash.png").convert_alpha()

    def add_bullet(self, player: sprites.Player) -> None:
        """
        Creates a bullet on the screen with the appropriate velocity.

        Parameters:
        player (sprites.Player): the player that shot the bullet.
        """
        x_vel = settings.BULLET_SPEED + player.vel.x
        if player.direction == "left":
            x_vel = -settings.BULLET_SPEED + player.vel.x
        bullet = sprites.Bullet(player.pos, x_vel, self.bullet_image, player)

        self.bullets.add(bullet)
        self.all_sprites.add(bullet)

    def update(self):
        """Updates all sprites."""
        self.all_sprites.update()
        self.handle_collisions()

    def handle_collisions(self):
        """Checks and handles player collisions with platforms and bullets."""
        for player in self.players:
            platform_collisions = pygame.sprite.spritecollide(
                player, self.platforms, False, pygame.sprite.collide_mask)
            if platform_collisions:
                platform = platform_collisions[0]
                if player.falling:
                    player.vel.y = 0
                    player.standing = True
                    # offset due to sprite feet being above the bottom of the image
                    player.pos.y = platform.rect.top + settings.PLAYER_OFFSET
            else:
                player.standing = False

            bullet_collisions = pygame.sprite.spritecollide(
                player, self.bullets, True, pygame.sprite.collide_mask)

            if bullet_collisions:
                bullet = bullet_collisions[0]
                if bullet.author != player:
                    player.vel.x += bullet.vel.x * settings.KNOCKBACK_MULTIPLIER
                    self.sfx_hit()

    def render(self):
        """Renders a single frame to the display."""
        self.screen.blit(self.background, (0, 0))

        self.all_sprites.draw(self.screen)

        pygame.display.flip()

    def quit(self):
        """Close pygame."""
        pygame.quit()


def main():
    game = Game()
    while game.running:
        game.new()
    game.quit()


if __name__ == "__main__":
    main()
