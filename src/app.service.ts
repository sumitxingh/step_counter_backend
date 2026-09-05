import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { status: number; message: string } {
    return { status: 200, message: 'Server is running' };
  }
}
