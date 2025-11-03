import pygame


class Spritesheet:
    """A class for sprite sheets."""

    def __init__(self, surface: pygame.Surface):
        """
        Initializes the sprite sheet object.

        Parameters:
        surface (pygame.Surface) = surface containing the sprite sheet.
        """
        self.sheet = surface

    def get_frame(self, rect: pygame.Rect, colorkey: tuple[int] = (0, 0, 0)) -> pygame.Surface:
        """
        Returns a single pygame.Surface object from pygame.Rect input.

        Parameters:
        rect (pygame.Rect): rect containing location and dimensions of the frame relative to the sprite sheet.
        colorkey (tuple[int]): values (R,G,B) represent color of transparent pixels.
        """
        image = pygame.Surface(rect.size)
        image.set_colorkey(colorkey)
        image.blit(self.sheet, (0, 0), rect)
        return image

    def get_frames(self, rects: list[pygame.Rect]) -> list[pygame.Surface]:
        """
        Returns a tuple of pygame.Surface objects from a input list of pygame.Rect.

        Parameters:
        rects (list[pygame.Rect]): a list containing the location and dimensions of every frame.
        """
        return [self.get_frame(rect) for rect in rects]
