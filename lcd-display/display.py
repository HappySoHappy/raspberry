import os
import sys
import time
import spidev
import logging
import numpy as np
from gpiozero import DigitalOutputDevice, DigitalInputDevice, PWMOutputDevice
from PIL import Image, ImageDraw, ImageFont


class SpiController:
    def __init__(self, spi=None, spiFrequency=40_000_000, resetPinId=27, dataCommandPinId=25, backlightPinId=18, backlightFrequency=1000):
        self.np = np
        self.SPI_FREQUENCY = spiFrequency
        self.BACKLIGHT_FREQUENCY = backlightFrequency

        self.RESET_PIN = self.gpio_mode(resetPinId, True) # Output
        self.DATA_COMMAND_PIN = self.gpio_mode(dataCommandPinId, True) # Output
        self.BACKLIGHT_PIN = self.gpio_pwm(backlightPinId)
        self.BACKLIGHT_PIN.value = 0

        self.SPI = spi or spidev.SpiDev(0, 0)
        self.SPI.max_speed_hz = spiFrequency
        self.SPI.mode = 0b00

    def gpio_mode(self, pin, mode, pull_up=None, active_state=True):
        return DigitalOutputDevice(pin, active_high=True, initial_value=False) if mode else DigitalInputDevice(pin, pull_up=pull_up, active_state=active_state)

    def gpio_pwm(self, pin):
        return PWMOutputDevice(pin, frequency=self.BACKLIGHT_FREQUENCY)
    
    def digital_write(self, pin, value): # command = false, data = true
        pin.on() if value else pin.off()

    def spi_write_byte(self, data):
        if self.SPI:
            self.SPI.writebytes(data)

    #def __del__(self):
    #    self.SPI.close()
    #    
    #    self.digital_write(self.RESET_PIN, True)
    #    self.digital_write(self.DATA_COMMAND_PIN, False)
#
    #    self.BACKLIGHT_PIN.close()

#Written for ST7789V2 driver
#https://github.com/Bodmer/TFT_eSPI/blob/master/TFT_Drivers/ST7789_Init.h
#https://www.phind.com/search/cm8yw0h2i00003j6tdixza4j8
class DisplayController(SpiController):
    _instance = None
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(DisplayController, cls).__new__(cls, *args, **kwargs)
        return cls._instance
    
    def iinit(self, horizontal = True, width = 280, height = 240):
        self.HORIZONTAL = horizontal
        self.WIDTH = width
        self.HEIGHT = height

        self.hard_reset()

        init_sequence = [
            (0x36, [0x00]), # MAC, set RGB landscape
            (0x3A, [0x05]), # Pixel format, 16bit
            (0xB2, [0x0B, 0x0B, 0x00, 0x33, 0x35]), # Timings
            (0xB7, [0x11]), # Gate scan and timing
            (0xBB, [0x35]), # VCOM
            (0xC0, [0x2C]), # LCM
            (0xC2, [0x01]), # VDV and VRH, voltage control
            (0xC3, [0x0D]), # VRH SET, voltage level
            (0xC4, [0x20]), # VDV SET, voltage regulator
            (0xC6, [0x13]), # Frame control
            (0xD0, [0xA4, 0xA1]), # Power control
            (0xD6, [0xA1]), # RGB Control
            (0xE0, [0xF0, 0x06, 0x0B, 0x0A, 0x09, 0x26, 0x29, 0x33, 0x41, 0x18, 0x16, 0x15, 0x29, 0x2D]), # Gamma correction table
            (0xE1, [0xF0, 0x04, 0x08, 0x08, 0x07, 0x03, 0x28, 0x32, 0x40, 0x3B, 0x19, 0x18, 0x2A, 0x2E]), # -Gamma correction table
            (0xE4, [0x25, 0x00, 0x00]), # Power mode
            (0x21, []), # Display inversion
            (0x11, []), # Sleep out, wake up
        ]

        for cmd, data in init_sequence:
            self.send_command(cmd)
            for d in data:
                self.send_data(d)
        
        time.sleep(0.1)
        self.send_command(0x29) # Display on

    def send_command(self, cmd):
        self.digital_write(self.DATA_COMMAND_PIN, False)
        self.spi_write_byte([cmd])
    
    def send_data(self, val):
        self.digital_write(self.DATA_COMMAND_PIN, True)
        self.spi_write_byte([val])
    
    def reset(self):
        self.send_command(0x01)

    def hard_reset(self):
        self.digital_write(self.RESET_PIN, True)
        time.sleep(0.01)
        self.digital_write(self.RESET_PIN, False)
        time.sleep(0.01)
        self.digital_write(self.RESET_PIN, True)
        time.sleep(0.01)

    def set_window_size(self, x_start, y_start, x_end, y_end, horizontal=True):
        if horizontal:
            x_start, x_end = x_start + 20, x_end + 20
        else:
            y_start, y_end = y_start + 20, y_end + 20
        
        self.send_command(0x2A)
        for val in [x_start >> 8, x_start & 0xff, (x_end - 1) >> 8, (x_end - 1) & 0xff]:
            self.send_data(val)
        
        self.send_command(0x2B)
        for val in [y_start >> 8, y_start & 0xff, (y_end - 1) >> 8, (y_end - 1) & 0xff]:
            self.send_data(val)
        
        self.send_command(0x2C)
    
    def set_display_brightness(self, brightness):
        self.BACKLIGHT_PIN.value = max(min(100, brightness), 0) / 100
    
    def flush_image(self):
        buffer = [0xFF] * (self.WIDTH * self.HEIGHT * 2)
        self.set_window_size(0, 0, self.WIDTH, self.HEIGHT)
        self.digital_write(self.DATA_COMMAND_PIN, True)
        for i in range(0, len(buffer), 4096):
            self.spi_write_byte(buffer[i:i+4096])
    
    def draw_image(self, Image):
        imwidth, imheight = Image.size
        if imwidth == self.WIDTH and imheight == self.HEIGHT:
            img = self.np.asarray(Image)
            pix = self.np.zeros((self.HEIGHT, self.WIDTH, 2), dtype = self.np.uint8)
            #RGB888 >> RGB565
            pix[...,[0]] = self.np.add(self.np.bitwise_and(img[...,[0]],0xF8),self.np.right_shift(img[...,[1]],5))
            pix[...,[1]] = self.np.add(self.np.bitwise_and(self.np.left_shift(img[...,[1]],3),0xE0), self.np.right_shift(img[...,[2]],3))
            pix = pix.flatten().tolist()

            self.send_command(0x36)
            self.send_data(0x70)
            self.set_window_size(0, 0, self.WIDTH, self.HEIGHT, 1)
            self.digital_write(self.DATA_COMMAND_PIN,True)
            for i in range(0,len(pix),4096):
                self.spi_write_byte(pix[i:i+4096])
        else:
            img = self.np.asarray(Image)
            pix = self.np.zeros((imheight,imwidth , 2), dtype = self.np.uint8)
            
            pix[...,[0]] = self.np.add(self.np.bitwise_and(img[...,[0]],0xF8),self.np.right_shift(img[...,[1]],5))
            pix[...,[1]] = self.np.add(self.np.bitwise_and(self.np.left_shift(img[...,[1]],3),0xE0), self.np.right_shift(img[...,[2]],3))
            pix = pix.flatten().tolist()
            
            self.send_command(0x36)
            self.send_data(0x00)
            self.set_window_size(0, 0, self.HEIGHT, self.WIDTH, 0)
            self.digital_write(self.DATA_COMMAND_PIN,True)
            for i in range(0, len(pix), 4096):
                self.spi_write_byte(pix[i: i+4096])


try:
    display = DisplayController()
    display.iinit()
    display.flush_image()
    display.set_display_brightness(20)

    image = Image.new("RGB", (display.WIDTH, display.HEIGHT), "RED")

    draw = ImageDraw.Draw(image)
    draw.text((25, 120), 'Hello Hardware World', fill = "BLACK")

    display.draw_image(image)

    time.sleep(5)

    image = Image.new("RGB", (display.WIDTH, display.HEIGHT), "BLACK")
    display.draw_image(image)


except KeyboardInterrupt:
    exit()