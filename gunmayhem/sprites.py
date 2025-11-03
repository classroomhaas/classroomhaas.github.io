import pygame
import pygame.freetype
import settings
import controls
import itertools
import copy


# aliases
Vector = pygame.math.Vector2  # Pygame class for 2D vectors
Sprite = pygame.sprite.Sprite  # Pygame class for sprites


class Animation():
    """A class for player animations."""

    def __init__(self, idle: tuple[pygame.Surface], run: tuple[pygame.Surface], jump: tuple[pygame.Surface]):
        """
        Initializes the Animation object.

        idle (tuple[pygame.Surface]): sequence of images for the idle animation.
        run (tuple[pygame.Surface]): sequence of images for the run animation.
        jump (tuple[pygame.Surface]): two images.
            jump[0]: player going up.
            jump[1]: player going down.
        """
        # create infinite cycles of the images in the tuples to be animated
        self.idle = itertools.cycle(idle)
        self.run = itertools.cycle(run)
        # jump is just a tuple of two images
        self.jump = jump


class Player(Sprite):
    """A class for players."""

    def __init__(self, name: str, controls: controls.KeyboardControl, spawn_point: tuple, animation: Animation, direction, muzzle_flash: pygame.Surface, sfx: dict) -> None:
        """
        Initializes the Player object.

        Parameters:
        name (str): the name of the player.
        controls (KeyboardControl): player keyboard control settings.
        spawn_point (tuple): coordinates (x, y) where player will be created.
        animations (Animation): contains images that represent the player's visual appearance.
        """
        super().__init__() # call parent class constructor
        self.animation = animation
        self.set_image() # set initial image
        self.set_vectors(spawn_point)
        self.set_rect() # set rect that contains player
        self.set_mask() # set the collision mask

        self.spawn_direction = direction
        self.direction = direction

        self.spawn_point = spawn_point
        self.controls = controls
        self.falling = True
        self.standing = False

        self.respawn_count = 0

        animation_ticks_per_frame = settings.FPS // settings.PLAYER_ANIMATION_FPS
        sound_ticks_per_frame = animation_ticks_per_frame

        self.animation_tick = itertools.cycle(range(animation_ticks_per_frame))
        self.step_tick = itertools.cycle(range(sound_ticks_per_frame))

        self.muzzle_flash = muzzle_flash
        self.shooting = False

        self.name = name
        self.sfx = sfx

    def set_mask(self):
        """Sets a mask from the player image used for collision checking."""
        self.mask = pygame.mask.from_surface(self.image)

    def set_rect(self):
        """Sets the player's rect from the player image and position."""
        self.rect = self.image.get_rect()
        # places the rectangle's and image's midbottom at the required position
        self.rect.midbottom = self.pos

    def set_vectors(self, spawn_point):
        """Sets the initial position, velocity, and acceleration vectors."""
        self.pos = Vector(spawn_point)
        self.vel = Vector(0, 0)
        self.acc = Vector(0, 0)

    def set_image(self):
        """Sets the player's image to the next frame for the idle animation."""
        self.image = next(self.animation.idle)

    def update(self):
        """Updates the sprite each frame, taking into account user input."""
        self.handle_keys()  # keyboard input
        self.apply_friction()
        self.update_velocity()
        self.update_position()
        self.update_image()
        self.set_mask()  # collision mask

        if self.pos.y > settings.VOID_HEIGHT:
            self.respawn()  # player dies when below certain height

    def update_image(self):
        """Update the sprite's image to enable animations."""
        if not self.standing:
            if self.falling:
                self.image = self.animation.jump[0]  # use falling down image
            else:
                self.image = self.animation.jump[1]  # use jumping up image

            self.blit_muzzle_flash_if_shooting()
            self.flip_if_facing_left()

        elif next(self.animation_tick) == 0:
            # if signs of acceleration and velocity are same, then player is running
            if self.acc.x * self.vel.x > 0:
                self.image = next(self.animation.run)
                # only advance animation every n frames due to difference in game FPS and animation FPS
                if next(self.step_tick) == 0:
                    self.sfx_step()
            else:
                self.image = next(self.animation.idle)

            self.blit_muzzle_flash_if_shooting()
            self.flip_if_facing_left()

    def blit_muzzle_flash_if_shooting(self):
        """Blits the image of a muzzle flash onto to the sprite if the player is shooting."""
        if self.shooting:
            self.image = self.image.copy()
            # calculate offset to determine where to blit the muzzle flash
            x_offset = settings.MUZZLE_FLASH_OFFSET_X
            y_offset = settings.MUZZLE_FLASH_OFFSET_Y
            if self.acc.x * self.vel.x > 0 and self.standing:
                y_offset += settings.MUZZLE_FLASH_RUNNING_OFFSET_Y

            # blit the image of a muzzle flash at the proper location
            self.image.blit(self.muzzle_flash, (x_offset, y_offset))
            self.shooting = False

    def flip_if_facing_left(self):
        """Flips the player if they are facing left."""
        if self.direction == "left":
            self.image = pygame.transform.flip(self.image, True, False)

    def update_position(self):
        """Updates the position of the player based on the velocity and acceleration."""
        # update position vector
        # Δd = v_2Δt - (1/2)aΔt^2, Δt = 1 tick -> Δd = v_2 - 0.5a
        self.pos += self.vel - 0.5 * self.acc

        # move sprite
        self.rect.midbottom = self.pos
        self.falling = self.vel.y > 0

    def update_velocity(self):
        """Updates the velocity based on the acceleration."""
        # update new velocity
        # v_2 = v_1 + aΔt, Δt = 1 tick -> v_2 = v_1 + a
        self.vel += self.acc

        # fixes perpetual running
        if abs(self.vel.x) < 0.4:
            self.vel.x = 0

    def apply_friction(self):
        """Applies friction to the player acceleration."""
        # model friction as proportional to player speed
        # this limits max speed
        self.acc.x += self.vel.x * settings.PLAYER_FRICTION

    def handle_keys(self):
        """Handles the player keyboard input."""
        self.acc = Vector(
            0, settings.PLAYER_GRAVITY)  # acceleration in the y is gravity
        keys = pygame.key.get_pressed()
        if keys[self.controls.UP] and self.standing:
            self.jump()
        if keys[self.controls.LEFT]:
            self.move_left()
        elif keys[self.controls.RIGHT]:
            self.move_right()

    def move_right(self):
        """Causes the player to accelerate right."""
        self.acc.x = settings.PLAYER_ACC
        self.direction = "right"

    def move_left(self):
        """Causes the player to accelerate left."""
        self.acc.x = -settings.PLAYER_ACC
        self.direction = "left"

    def jump(self):
        """Causes the player to jump."""
        self.vel.y = settings.PLAYER_JUMP_HEIGHT
        self.standing = False
        self.sfx_jump()

    def sfx_jump(self):
        """Plays the sound effect for the player jumping."""
        sound = self.sfx["jump"]
        sound.play()

    def sfx_step(self):
        """Plays the sound effect for the player running."""
        sound = self.sfx["step"]
        sound.play()

    def sfx_death(self):
        """Plays the sound effect for the player's death."""
        sound = self.sfx["death"]
        sound.play()

    def respawn(self):
        """Resets the player's positiion, velocity, and acceleration."""
        self.sfx_death()
        self.pos = self.spawn_point
        self.direction = self.spawn_direction
        self.vel.x, self.vel.y = 0, 0
        self.respawn_count += 1


class Platform(Sprite):
    """A class for platforms."""

    def __init__(self, image: pygame.Surface, coordinates: tuple, tile_count: int) -> None:
        """
        Initializes the Platform object.

        Parameters:
        image (pygame.Surface): a surface representing one tile.
        coordinates (tuple): (x, y) representing the center of the platform.
        tile_count (int): number of tiles the platform contains.
        """
        super().__init__()
        self.count = tile_count

        h = image.get_height()
        w = image.get_width()

        # create the blank surface on which the texture is tiled
        self.create_surface(h, w)

        # paste individual tile images onto the surface
        self.blit_tiles(image, w)

        self.set_rect(coordinates)  # move the platforms to required locations
        self.mask = pygame.mask.from_surface(self.image)

    def create_surface(self, h: int, w: int):
        """Creates a surface on which textures are tiled."""
        width = w * self.count
        self.image = pygame.Surface((width, h))
        self.image.fill((255, 0, 0))

    def blit_tiles(self, image: pygame.Surface, w: int):
        """Blits the tile textures onto the surface."""
        x = 0
        for i in range(self.count):
            self.image.blit(image, (x, 0))
            x += w

    def set_rect(self, coordinates: tuple):
        """Sets the platform's rect attribute based on its image."""
        self.rect = self.image.get_rect()
        # move the platform enveloped in the rectangle to the given coordinates
        self.rect.center = coordinates


class Bullet(Sprite):
    """A class for bullets."""

    def __init__(self, player_pos: tuple, x_vel: int, image: pygame.Surface, author: object) -> None:
        """
        Initializes the Bullet object.

        Parameters:
        player_pos (tuple): the position of the player when the bullet was fired.
        x_vel (int): the velocity of the bullet.
        image (pygame.Surface): the image of the bullet.
        author (object): the player who fired the bullet.
        """
        super().__init__()
        self.author = author

        self.image = image
        self.mask = pygame.mask.from_surface(self.image)

        self.set_vectors(player_pos, x_vel)
        self.set_rect()
        self.set_mask()

    def set_mask(self):
        """Sets a mask from the bullet image used for collision checking."""
        self.mask = pygame.mask.from_surface(self.image)

    def set_vectors(self, player_pos: tuple, x_vel: int) -> None:
        """
        Sets the position, velocity, and acceleration vectors.

        Parameters:
        player_pos (tuple): a tuple (x,y) representing the position of the player who shot the bullet.
        x_vel (int): an int representing how many pixels the bullet moves per frame.
        """
        player_x, player_y = player_pos
        x_offset, y_offset = self.get_offset(x_vel)

        self.pos = Vector(player_x + x_offset, player_y + y_offset)
        self.vel = Vector(x_vel, 0)

    def get_offset(self, x_vel: int) -> tuple:
        """
        Gets the x- and y-offset for the bullets relative to the player's position.

        Parameters:
        x_vel (int): an int representing how many pixels the bullet is moving per frame.
        """
        x_offset = settings.BULLET_OFFSET_X
        y_offset = settings.BULLET_OFFSET_Y
        # check if player was moving
        if abs(x_vel) > settings.BULLET_SPEED:
            # add additonal offset due to change in height
            y_offset += settings.BULLET_RUNNING_OFFSET_Y
        if x_vel < 0:
            self.image = pygame.transform.flip(self.image, True, False)
            x_offset *= -1  # flip x-offset
        return x_offset, y_offset

    def set_rect(self):
        """Sets the bullet's rect based on its image."""
        self.rect = self.image.get_rect()
        self.rect.midbottom = self.pos

    def update(self):
        """Updates the bullet position based on its velocity."""
        self.pos.x += self.vel.x
        self.rect.center = self.pos

        # check if outside of screen
        if not (0 <= self.pos.x <= settings.WIDTH):
            self.kill()  # delete from all sprite groups to prevent memory leak


class Scoreboard(Sprite):
    """A class for Scoreboard objects."""

    def __init__(self, font: pygame.freetype.Font, color: tuple, position: tuple, player: object):
        """
        Initializes the scoreboard.

        Parameters:
        font (pygame.freetype.Font): the font used to display text.
        color (tuple): a tuple (R,G,B) representing the color of the text.
        position (tuple): a tuple (x,y) representing the position of the midbottom of the scoreboard.
        player (object): an object representing the player with an attribute called 'respawn_count'.
        """
        super().__init__()
        self.player = player
        self.pos = position
        self.font = font
        self.color = color

        # must create a copy of the idle animation to prevent modifying the original object,
        # which will cause the animation to speed up as it will be iterated two times per tick
        self.icon_animation = copy.copy(player.animation.idle)

        ticks_per_frame = settings.FPS // settings.PLAYER_ANIMATION_FPS
        self.animation_ticker = itertools.cycle(range(ticks_per_frame))

        self.set_image()

    def set_image(self):
        """Generates the image of the scoreboard based on the player attributes."""
        # generate the lines of text
        line_1 = self.font.render(self.player.name, self.color)[0]
        line_2 = self.font.render("Deaths: {}".format(
            self.player.respawn_count), self.color)[0]

        # get the dimensions of the lines
        line_space = 10
        default_width = 100
        line_1_height = line_1.get_height()
        line_2_height = line_2.get_height()

        # get the next icon frame every 6 ticks for 10 FPS
        if next(self.animation_ticker) == 0:
            self.icon = next(self.icon_animation)
        icon_width = self.icon.get_width()
        icon_height = self.icon.get_height()

        # get the minimum width and height
        width = icon_width + max(
            default_width,
            line_1.get_width(),
            line_2.get_width()
        )
        height = max(
            icon_height,
            line_1_height +
            line_2_height +
            line_space
        )

        self.image = pygame.Surface((width, height))

        # blits an image of the player on the left side of the scoreboard
        self.image.blit(self.icon, (0, 0))

        # blit line 1 (player name)
        self.image.blit(line_1, (icon_width, 0))
        # blit line 2 (deaths)
        self.image.blit(line_2, (icon_width, line_1_height + line_space))

        # set colorkey to black for transparency
        self.image.set_colorkey((0, 0, 0))

        # set rect
        self.rect = self.image.get_rect()
        self.rect.midbottom = self.pos

    def update(self):
        """Updates the scoreboard each tick."""
        self.set_image()
